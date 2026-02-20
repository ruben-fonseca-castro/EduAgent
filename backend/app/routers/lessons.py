"""Lesson generation router — generate personalized lessons via LangGraph pipeline."""

import asyncio
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.course import Course
from app.models.generated_lesson import GeneratedLesson
from app.schemas.student_profile import (
    LessonGenerateRequest,
    LessonGenerateResponse,
    LessonResponse,
)
from app.middleware.auth import get_current_user, require_student, decode_token

router = APIRouter(prefix="/api/lessons", tags=["lessons"])

# In-memory SSE queues keyed by lesson_id
_sse_queues: dict[str, asyncio.Queue] = {}


async def _run_lesson_pipeline(
    lesson_id: str,
    course_id: str,
    course_title: str,
    course_description: str,
    user_id: str,
):
    """Run the LangGraph lesson pipeline in the background and push SSE events.

    All args are plain strings to avoid SQLAlchemy session issues in background tasks.
    """
    queue = _sse_queues.get(lesson_id)

    try:
        # Send initial event
        if queue:
            await queue.put({"event": "status", "data": {"node": "starting", "message": "Initializing lesson generation..."}})

        # Get course materials as input context
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            from app.services.rag import retrieve_context
            rag_results = await retrieve_context(
                f"{course_title} {course_description or ''}",
                course_id,
                db,
                top_k=10,
            )
            course_content = "\n\n".join(r["content"] for r in rag_results) if rag_results else ""

            raw_input = f"""Course: {course_title}
Description: {course_description or 'N/A'}

Course Materials:
{course_content[:6000]}"""

            # Build initial state
            from app.lesson_engine.graph import build_graph

            initial_state = {
                "lesson_id": lesson_id,
                "raw_input": raw_input,
                "input_type": "prompt",
                "student_id": user_id,
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

            graph = build_graph()

            # Stream state changes through the graph
            # astream() yields {node_name: state_update} dicts after each node completes
            node_messages = {
                "parse_input": "Analyzing topic...",
                "plan_lesson": "Creating lesson plan...",
                "retrieve_student_context": "Retrieving your personal context...",
                "generate_content": "Generating lesson content...",
                "generate_figures": "Creating interactive figures...",
                "assemble_html": "Assembling final lesson...",
                "review_lesson": "Reviewing lesson quality...",
            }

            # Track the final state across all nodes
            final_state: dict = {}

            async for state_update in graph.astream(initial_state):
                # Each update is {node_name: partial_state_update}
                for node_name, node_output in state_update.items():
                    if not isinstance(node_output, dict):
                        continue

                    # Merge into final state
                    final_state.update(node_output)

                    # Send progress event to SSE
                    if node_name in node_messages and queue:
                        await queue.put({
                            "event": "status",
                            "data": {"node": node_name, "message": node_messages.get(node_name, node_name)},
                        })

                    # After plan_lesson, send the lesson plan preview
                    if node_name == "plan_lesson" and queue:
                        plan = node_output.get("lesson_plan") or {}
                        if plan:
                            await queue.put({
                                "event": "plan",
                                "data": {
                                    "title": plan.get("title", ""),
                                    "sections_count": len(plan.get("sections", [])),
                                    "objectives": plan.get("learning_objectives", []),
                                },
                            })

                    # After assemble_html, save the HTML to DB
                    if node_name == "assemble_html":
                        html_path = node_output.get("final_html", "") or final_state.get("final_html", "")

                        lesson = db.query(GeneratedLesson).filter(
                            GeneratedLesson.id == lesson_id
                        ).first()
                        if lesson:
                            lesson.html_path = html_path
                            lesson.status = "ready"

                            topic = final_state.get("topic", "")
                            if topic:
                                lesson.topic = topic

                            plan_data = final_state.get("lesson_plan")
                            if plan_data:
                                lesson.lesson_plan_json = json.dumps(plan_data)
                                lesson.duration_minutes = plan_data.get("estimated_duration_minutes", 30)

                            sections = final_state.get("generated_sections", [])
                            if sections:
                                lesson.sections_json = json.dumps(sections)

                            figures = final_state.get("generated_figures", [])
                            if figures:
                                lesson.figures_json = json.dumps(figures)

                            db.commit()

            # Final check — if lesson wasn't marked ready (e.g. assemble_html event missed)
            lesson = db.query(GeneratedLesson).filter(GeneratedLesson.id == lesson_id).first()
            if lesson and lesson.status == "generating":
                # Check if we have a final_html from the run
                html_path = final_state.get("final_html", "")
                if html_path:
                    lesson.html_path = html_path
                    lesson.status = "ready"

                    topic = final_state.get("topic", "")
                    if topic:
                        lesson.topic = topic

                    plan_data = final_state.get("lesson_plan")
                    if plan_data:
                        lesson.lesson_plan_json = json.dumps(plan_data)

                    sections = final_state.get("generated_sections", [])
                    if sections:
                        lesson.sections_json = json.dumps(sections)

                    figures = final_state.get("generated_figures", [])
                    if figures:
                        lesson.figures_json = json.dumps(figures)

                    db.commit()
                else:
                    lesson.status = "error"
                    lesson.error_message = "Pipeline completed but no HTML was generated"
                    db.commit()

            if queue:
                await queue.put({"event": "complete", "data": {"lesson_id": lesson_id}})

        finally:
            db.close()

    except Exception as e:
        # Update DB with error
        try:
            from app.database import SessionLocal
            db = SessionLocal()
            lesson = db.query(GeneratedLesson).filter(GeneratedLesson.id == lesson_id).first()
            if lesson:
                lesson.status = "error"
                lesson.error_message = str(e)[:1000]
                db.commit()
            db.close()
        except Exception:
            pass

        if queue:
            await queue.put({"event": "error", "data": {"message": str(e)[:200]}})

    finally:
        if queue:
            await queue.put(None)  # Signal end of stream
        _sse_queues.pop(lesson_id, None)


@router.post("/generate", response_model=LessonGenerateResponse, status_code=201)
async def generate_lesson(
    req: LessonGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Start generating a personalized lesson for a course.

    Returns a lesson_id immediately. Use the /stream endpoint to follow progress.
    """
    course = db.query(Course).filter(Course.id == req.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    lesson_id = str(uuid.uuid4())

    # Create DB record
    lesson = GeneratedLesson(
        id=lesson_id,
        course_id=req.course_id,
        user_id=current_user.id,
        topic=course.title,
        status="generating",
    )
    db.add(lesson)
    db.commit()

    # Create SSE queue
    _sse_queues[lesson_id] = asyncio.Queue()

    # Extract primitive values before session might close
    course_id_str = course.id
    course_title_str = course.title
    course_desc_str = course.description or ""
    user_id_str = current_user.id

    # Launch pipeline in background (pass only plain strings, not SQLAlchemy objects)
    asyncio.create_task(
        _run_lesson_pipeline(
            lesson_id,
            course_id_str,
            course_title_str,
            course_desc_str,
            user_id_str,
        )
    )

    return LessonGenerateResponse(lesson_id=lesson_id, status="generating")


@router.get("/{lesson_id}/stream")
async def stream_lesson_progress(
    lesson_id: str,
    token: str | None = None,
    db: Session = Depends(get_db),
):
    """SSE stream of lesson generation progress.

    Accepts auth token via ?token= query parameter because EventSource
    cannot set Authorization headers.
    """
    # Authenticate via query param token (EventSource limitation)
    if token:
        try:
            payload = decode_token(token)
            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(status_code=401, detail="Invalid token")
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")
    # else: allow unauthenticated preview (or enforce auth if needed)

    queue = _sse_queues.get(lesson_id)
    if not queue:
        # Lesson might already be complete — just send a complete event
        return StreamingResponse(
            _immediate_complete(lesson_id),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    return StreamingResponse(
        _sse_generator(lesson_id, queue),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _immediate_complete(lesson_id: str):
    yield f"data: {json.dumps({'event': 'complete', 'data': {'lesson_id': lesson_id}})}\n\n"


async def _sse_generator(lesson_id: str, queue: asyncio.Queue):
    try:
        while True:
            msg = await asyncio.wait_for(queue.get(), timeout=300)  # 5 min timeout
            if msg is None:
                break
            yield f"data: {json.dumps(msg)}\n\n"
    except asyncio.TimeoutError:
        yield f"data: {json.dumps({'event': 'error', 'data': {'message': 'Generation timed out'}})}\n\n"


@router.get("/{lesson_id}", response_model=LessonResponse)
def get_lesson(
    lesson_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get lesson metadata and status."""
    lesson = db.query(GeneratedLesson).filter(GeneratedLesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    return LessonResponse(
        id=lesson.id,
        course_id=lesson.course_id,
        user_id=lesson.user_id,
        topic=lesson.topic,
        status=lesson.status,
        sections_json=lesson.sections_json,
        figures_json=lesson.figures_json,
        duration_minutes=lesson.duration_minutes,
        error_message=lesson.error_message,
        created_at=lesson.created_at.isoformat(),
    )


@router.get("/{lesson_id}/content")
def get_lesson_content(
    lesson_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the generated lesson HTML content."""
    lesson = db.query(GeneratedLesson).filter(GeneratedLesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    if lesson.status != "ready":
        raise HTTPException(status_code=409, detail=f"Lesson is still {lesson.status}")

    # Read HTML from disk
    if lesson.html_path:
        from pathlib import Path
        html_path = Path(lesson.html_path)
        if html_path.exists():
            html_content = html_path.read_text(encoding="utf-8")
            return {"lesson_id": lesson_id, "html": html_content, "status": "ready"}

    # Fallback: return sections as JSON
    return {
        "lesson_id": lesson_id,
        "html": None,
        "sections": json.loads(lesson.sections_json) if lesson.sections_json else [],
        "figures": json.loads(lesson.figures_json) if lesson.figures_json else [],
        "status": lesson.status,
    }


@router.get("/course/{course_id}")
def list_lessons_for_course(
    course_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all lessons generated for a course by the current user."""
    lessons = (
        db.query(GeneratedLesson)
        .filter(
            GeneratedLesson.course_id == course_id,
            GeneratedLesson.user_id == current_user.id,
        )
        .order_by(GeneratedLesson.created_at.desc())
        .all()
    )

    return [
        LessonResponse(
            id=l.id,
            course_id=l.course_id,
            user_id=l.user_id,
            topic=l.topic,
            status=l.status,
            duration_minutes=l.duration_minutes,
            error_message=l.error_message,
            created_at=l.created_at.isoformat(),
        )
        for l in lessons
    ]
