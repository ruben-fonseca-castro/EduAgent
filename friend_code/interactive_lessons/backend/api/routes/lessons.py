from __future__ import annotations

import asyncio
import json
import time
import uuid
from pathlib import Path
from typing import AsyncGenerator

import aiofiles
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse

from backend.api.schemas import GenerateLessonRequest, GenerateLessonResponse, LessonMetadata
from backend.config import get_settings

router = APIRouter(prefix="/api/lessons", tags=["lessons"])

# In-memory registry: lesson_id → asyncio.Queue
_lesson_queues: dict[str, asyncio.Queue] = {}


def get_queue(lesson_id: str) -> asyncio.Queue:
    if lesson_id not in _lesson_queues:
        _lesson_queues[lesson_id] = asyncio.Queue()
    return _lesson_queues[lesson_id]


async def _run_agent(lesson_id: str, prompt: str, student_id: str | None, input_type: str = "prompt") -> None:
    """Background task: runs LangGraph agent and pushes SSE events to queue."""
    from backend.agent.graph import build_graph
    from backend.agent.state import LessonState

    queue = get_queue(lesson_id)
    settings = get_settings()

    initial_state: LessonState = {
        "lesson_id": lesson_id,
        "raw_input": prompt,
        "input_type": input_type,
        "student_id": student_id,
        "topic": "",
        "extracted_text": "",
        "lesson_plan": None,
        "student_context": "",
        "student_profile": {},
        "messages": [],
        "generated_sections": [],
        "generated_figures": [],
        "final_html": "",
        "review_result": None,
        "iteration_count": 0,
        "current_node": "",
        "error": None,
        "completed": False,
    }

    NODE_NAMES = {
        "parse_input", "plan_lesson", "retrieve_student_context",
        "generate_content", "generate_figures", "assemble_html", "review_lesson"
    }
    node_start_times: dict[str, float] = {}

    try:
        graph = build_graph()
        async for event in graph.astream_events(initial_state, version="v2"):
            kind = event.get("event", "")
            name = event.get("name", "")

            if kind == "on_chain_start" and name in NODE_NAMES:
                node_start_times[name] = time.time()
                await queue.put({"type": "node_start", "node": name})

            elif kind == "on_chain_end" and name in NODE_NAMES:
                start_t = node_start_times.pop(name, time.time())
                took_ms = int((time.time() - start_t) * 1000)
                await queue.put({"type": "node_end", "node": name, "took_ms": took_ms})

            elif kind == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    await queue.put({"type": "token", "content": chunk.content})

            elif kind == "on_custom_event":
                await queue.put(event.get("data", {}))

        # Signal completion
        html_url = f"/lessons/{lesson_id}.html"
        await queue.put({
            "type": "complete",
            "lesson_id": lesson_id,
            "html_url": html_url,
        })
    except Exception as exc:
        await queue.put({"type": "error", "message": str(exc)})
    finally:
        await queue.put(None)  # sentinel


@router.post("/generate", response_model=GenerateLessonResponse)
async def generate_lesson(req: GenerateLessonRequest, background_tasks: BackgroundTasks):
    lesson_id = str(uuid.uuid4())
    get_queue(lesson_id)  # pre-create queue
    background_tasks.add_task(_run_agent, lesson_id, req.prompt, req.student_id)
    return GenerateLessonResponse(
        lesson_id=lesson_id,
        stream_url=f"/api/lessons/{lesson_id}/stream",
    )


@router.post("/generate-from-pdf", response_model=GenerateLessonResponse)
async def generate_from_pdf(
    background_tasks: BackgroundTasks,
    files: list = None,
    student_id: str | None = None,
):
    from fastapi import UploadFile, Form
    # Handled separately with multipart — see below
    raise HTTPException(status_code=501, detail="Use the multipart endpoint")


from fastapi import UploadFile, Form

@router.post("/generate-from-pdf-upload", response_model=GenerateLessonResponse)
async def generate_from_pdf_upload(
    background_tasks: BackgroundTasks,
    files: list[UploadFile],
    student_id: str | None = Form(default=None),
):
    settings = get_settings()
    from backend.utils.pdf_parser import extract_text_from_upload

    combined_text = ""
    for upload in files:
        text = await extract_text_from_upload(upload)
        combined_text += f"\n\n--- {upload.filename} ---\n\n{text}"

    lesson_id = str(uuid.uuid4())
    get_queue(lesson_id)
    background_tasks.add_task(_run_agent, lesson_id, combined_text.strip(), student_id, "pdf")
    return GenerateLessonResponse(
        lesson_id=lesson_id,
        stream_url=f"/api/lessons/{lesson_id}/stream",
    )


async def _sse_generator(lesson_id: str) -> AsyncGenerator[str, None]:
    queue = get_queue(lesson_id)
    heartbeat_interval = 15  # seconds

    while True:
        try:
            event = await asyncio.wait_for(queue.get(), timeout=heartbeat_interval)
        except asyncio.TimeoutError:
            yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
            continue

        if event is None:
            break

        yield f"data: {json.dumps(event)}\n\n"


@router.get("/{lesson_id}/stream")
async def stream_lesson(lesson_id: str):
    return StreamingResponse(
        _sse_generator(lesson_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/", response_model=list[LessonMetadata])
async def list_lessons():
    settings = get_settings()
    lessons_dir = Path(settings.lessons_dir)
    results = []
    for meta_file in sorted(lessons_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        async with aiofiles.open(meta_file) as f:
            data = json.loads(await f.read())
        results.append(LessonMetadata(**data))
    return results


@router.get("/{lesson_id}", response_class=HTMLResponse)
async def get_lesson(lesson_id: str):
    settings = get_settings()
    html_path = Path(settings.lessons_dir) / f"{lesson_id}.html"
    if not html_path.exists():
        raise HTTPException(status_code=404, detail="Lesson not found")
    async with aiofiles.open(html_path) as f:
        return HTMLResponse(content=await f.read())
