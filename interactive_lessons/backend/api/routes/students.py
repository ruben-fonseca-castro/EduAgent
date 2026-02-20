from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Form, HTTPException, UploadFile

from backend.api.schemas import CreateStudentRequest, StudentContextUploadResponse, StudentProfile
from backend.config import get_settings

router = APIRouter(prefix="/api/students", tags=["students"])


def _student_meta_path(student_id: str, settings) -> Path:
    return Path(settings.student_context_dir) / student_id / "profile.json"


async def _load_profile(student_id: str, settings) -> dict:
    meta_path = _student_meta_path(student_id, settings)
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail=f"Student {student_id} not found")
    async with aiofiles.open(meta_path) as f:
        return json.loads(await f.read())


@router.post("/", response_model=StudentProfile)
async def create_student(req: CreateStudentRequest):
    settings = get_settings()
    student_id = str(uuid.uuid4())
    student_dir = Path(settings.student_context_dir) / student_id
    student_dir.mkdir(parents=True, exist_ok=True)

    profile = {
        "student_id": student_id,
        "name": req.name,
        "grade": req.grade,
        "subjects": req.subjects,
        "notes": req.notes,
        "context_files": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    async with aiofiles.open(student_dir / "profile.json", "w") as f:
        await f.write(json.dumps(profile, indent=2))

    return StudentProfile(**profile)


@router.get("/", response_model=list[StudentProfile])
async def list_students():
    settings = get_settings()
    base = Path(settings.student_context_dir)
    students = []
    for profile_file in base.glob("*/profile.json"):
        async with aiofiles.open(profile_file) as f:
            students.append(StudentProfile(**json.loads(await f.read())))
    return sorted(students, key=lambda s: s.created_at, reverse=True)


@router.get("/{student_id}", response_model=StudentProfile)
async def get_student(student_id: str):
    settings = get_settings()
    profile = await _load_profile(student_id, settings)
    return StudentProfile(**profile)


@router.post("/{student_id}/context", response_model=StudentContextUploadResponse)
async def upload_student_context(student_id: str, files: list[UploadFile]):
    settings = get_settings()
    profile = await _load_profile(student_id, settings)

    student_dir = Path(settings.student_context_dir) / student_id
    from backend.rag.indexer import index_files
    from backend.utils.pdf_parser import extract_text_from_upload

    processed = []
    all_chunks = []

    for upload in files:
        save_path = student_dir / upload.filename
        content = await upload.read()
        async with aiofiles.open(save_path, "wb") as f:
            await f.write(content)

        text = await extract_text_from_upload(upload, content=content)
        chunks = index_files(student_id, [(upload.filename, text)])
        all_chunks.extend(chunks)
        processed.append(upload.filename)

    # Update profile context_files
    existing = set(profile.get("context_files", []))
    existing.update(processed)
    profile["context_files"] = sorted(existing)
    async with aiofiles.open(_student_meta_path(student_id, settings), "w") as f:
        await f.write(json.dumps(profile, indent=2))

    return StudentContextUploadResponse(
        student_id=student_id,
        indexed_chunks=len(all_chunks),
        files_processed=processed,
        message=f"Indexed {len(all_chunks)} chunks from {len(processed)} file(s)",
    )


@router.delete("/{student_id}")
async def delete_student(student_id: str):
    import shutil
    settings = get_settings()
    student_dir = Path(settings.student_context_dir) / student_id
    if not student_dir.exists():
        raise HTTPException(status_code=404, detail=f"Student {student_id} not found")

    # Remove ChromaDB collection
    try:
        import chromadb
        client = chromadb.PersistentClient(path=settings.chroma_db_path)
        collection_name = f"student_{student_id.replace('-', '_')}"
        client.delete_collection(collection_name)
    except Exception:
        pass

    shutil.rmtree(student_dir)
    return {"message": f"Student {student_id} deleted"}
