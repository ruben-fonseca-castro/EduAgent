"""Courses router — course management and material upload."""

import uuid
import asyncio
import threading
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.config import settings
from app.models.user import User
from app.models.course import Course
from app.models.course_material import CourseMaterial
from app.models.class_ import Class, ClassEnrollment
from app.schemas.course import (
    CourseCreate,
    CourseResponse,
    CourseListResponse,
    MaterialResponse,
    MaterialListResponse,
)
from app.middleware.auth import get_current_user, require_teacher

router = APIRouter(prefix="/api/courses", tags=["courses"])

ALLOWED_EXTENSIONS = {
    "pdf": "pdf",
    "png": "image", "jpg": "image", "jpeg": "image", "gif": "image", "webp": "image",
    "mp4": "video", "mov": "video", "avi": "video", "webm": "video",
    "doc": "doc", "docx": "doc", "txt": "doc", "md": "doc",
}

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


def _course_to_response(course: Course) -> CourseResponse:
    return CourseResponse(
        id=course.id,
        class_id=course.class_id,
        teacher_id=course.teacher_id,
        title=course.title,
        description=course.description,
        created_at=course.created_at.isoformat(),
        materials_count=len(course.materials) if course.materials else 0,
    )


def _material_to_response(material: CourseMaterial) -> MaterialResponse:
    return MaterialResponse(
        id=material.id,
        course_id=material.course_id,
        filename=material.filename,
        file_type=material.file_type,
        file_size=material.file_size,
        status=material.status,
        error_message=material.error_message,
        created_at=material.created_at.isoformat(),
    )


def _process_material_sync(material_id: str) -> None:
    """Run the RAG pipeline synchronously in a background thread with its own DB session."""
    from app.services.rag import extract_text, chunk_text
    import json

    bg_db = SessionLocal()
    try:
        material = bg_db.query(CourseMaterial).filter(CourseMaterial.id == material_id).first()
        if not material:
            return

        # Step 1: Extract text
        text = extract_text(material.file_path, material.file_type)

        if not text or text.startswith("["):
            from app.models.material_chunk import MaterialChunk
            chunk = MaterialChunk(
                material_id=material.id,
                chunk_index=0,
                content=text or f"[{material.filename}]",
                token_count=len(text.split()) if text else 0,
            )
            bg_db.add(chunk)
            material.status = "ready"
            bg_db.commit()
            return

        # Step 2: Chunk
        chunks = chunk_text(text)
        if not chunks:
            material.status = "ready"
            bg_db.commit()
            return

        # Step 3: Embed (run async embed in a new event loop in this thread)
        from app.services.ai_client import _oracle_configured

        embeddings: list[list[float]] = []
        if _oracle_configured():
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                from app.services.ai_client import oracle_embed
                embeddings = loop.run_until_complete(
                    oracle_embed(chunks, model_id=settings.EMBEDDING_MODEL)
                )
                loop.close()
            except Exception:
                embeddings = [[0.0] * 384 for _ in chunks]
        else:
            embeddings = [[0.0] * 384 for _ in chunks]

        # Step 4: Store
        from app.models.material_chunk import MaterialChunk
        for i, (chunk_content, embedding) in enumerate(zip(chunks, embeddings)):
            chunk = MaterialChunk(
                material_id=material.id,
                chunk_index=i,
                content=chunk_content,
                embedding=json.dumps(embedding),
                token_count=len(chunk_content.split()),
            )
            bg_db.add(chunk)

        material.status = "ready"
        bg_db.commit()

    except Exception as e:
        try:
            material = bg_db.query(CourseMaterial).filter(CourseMaterial.id == material_id).first()
            if material:
                material.status = "error"
                material.error_message = str(e)[:500]
                bg_db.commit()
        except Exception:
            pass
    finally:
        bg_db.close()


def _schedule_processing(material_id: str) -> None:
    """Spawn a daemon thread to process material without blocking the request."""
    t = threading.Thread(target=_process_material_sync, args=(material_id,), daemon=True)
    t.start()


@router.post("", response_model=CourseResponse, status_code=201)
def create_course(
    req: CourseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """Create a new course (teacher only)."""
    cls = db.query(Class).filter(Class.id == req.class_id).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if cls.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your class")

    course = Course(
        id=str(uuid.uuid4()),
        class_id=req.class_id,
        teacher_id=current_user.id,
        title=req.title,
        description=req.description,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return _course_to_response(course)


@router.get("", response_model=CourseListResponse)
def list_courses(
    class_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List courses."""
    query = db.query(Course)

    if current_user.role == "teacher":
        query = query.filter(Course.teacher_id == current_user.id)
    else:
        enrolled_class_ids = [
            e.class_id for e in
            db.query(ClassEnrollment).filter(ClassEnrollment.user_id == current_user.id).all()
        ]
        query = query.filter(Course.class_id.in_(enrolled_class_ids))

    if class_id:
        query = query.filter(Course.class_id == class_id)

    courses = query.order_by(Course.created_at.desc()).all()
    return CourseListResponse(
        courses=[_course_to_response(c) for c in courses],
        total=len(courses),
    )


@router.get("/{course_id}", response_model=CourseResponse)
def get_course(
    course_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return _course_to_response(course)


@router.post("/{course_id}/materials", response_model=MaterialResponse, status_code=201)
async def upload_material(
    course_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """Upload course material and trigger RAG processing in a background thread."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your course")

    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '.{ext}' not supported. Allowed: {', '.join(ALLOWED_EXTENSIONS.keys())}",
        )

    file_type = ALLOWED_EXTENSIONS[ext]
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 50MB)")

    upload_dir = Path(settings.UPLOAD_DIR) / course_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_id = str(uuid.uuid4())
    file_path = upload_dir / f"{file_id}.{ext}"
    file_path.write_bytes(content)

    material = CourseMaterial(
        id=file_id,
        course_id=course_id,
        filename=file.filename or f"upload.{ext}",
        file_type=file_type,
        file_path=str(file_path),
        file_size=len(content),
        status="processing",
    )
    db.add(material)
    db.commit()
    db.refresh(material)

    # Fire-and-forget in a daemon thread — avoids asyncio.create_task pitfalls
    _schedule_processing(material.id)

    return _material_to_response(material)


@router.get("/{course_id}/materials", response_model=MaterialListResponse)
def list_materials(
    course_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    materials = (
        db.query(CourseMaterial)
        .filter(CourseMaterial.course_id == course_id)
        .order_by(CourseMaterial.created_at.desc())
        .all()
    )
    return MaterialListResponse(
        materials=[_material_to_response(m) for m in materials],
        total=len(materials),
    )


@router.get("/{course_id}/materials/{material_id}/download")
def download_material(
    course_id: str,
    material_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download/stream a course material file."""
    from fastapi.responses import FileResponse
    material = db.query(CourseMaterial).filter(
        CourseMaterial.id == material_id,
        CourseMaterial.course_id == course_id,
    ).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    file_path = Path(material.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    media_types = {
        "pdf": "application/pdf",
        "image": "image/*",
        "video": "video/*",
        "text": "text/plain",
    }
    media_type = media_types.get(material.file_type, "application/octet-stream")
    return FileResponse(
        path=str(file_path),
        filename=material.filename,
        media_type=media_type,
    )


@router.delete("/{course_id}/materials/{material_id}", status_code=204)
def delete_material(
    course_id: str,
    material_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course or course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your course")

    material = db.query(CourseMaterial).filter(
        CourseMaterial.id == material_id,
        CourseMaterial.course_id == course_id,
    ).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    try:
        Path(material.file_path).unlink(missing_ok=True)
    except Exception:
        pass

    db.delete(material)
    db.commit()
