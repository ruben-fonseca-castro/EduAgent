from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    settings.ensure_dirs()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="EduAgent – Interactive Lesson Planner",
        description="Agentic system that generates personalized interactive HTML lessons.",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── API routes (must be registered BEFORE static mounts) ──────────────────
    from backend.api.routes.lessons import router as lessons_router
    from backend.api.routes.students import router as students_router

    app.include_router(lessons_router)
    app.include_router(students_router)

    # ── Static file serving ───────────────────────────────────────────────────
    settings = get_settings()

    lessons_dir = Path(settings.lessons_dir)
    lessons_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/lessons", StaticFiles(directory=str(lessons_dir)), name="lessons")

    frontend_dir = Path(__file__).parent.parent / "frontend"
    if frontend_dir.exists():
        app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")

    return app


app = create_app()
