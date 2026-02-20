from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


# ── Lesson schemas ────────────────────────────────────────────────────────────

class GenerateLessonRequest(BaseModel):
    prompt: str = Field(..., description="Topic or lesson description")
    student_id: Optional[str] = None


class LessonMetadata(BaseModel):
    lesson_id: str
    title: str
    topic: str
    student_id: Optional[str]
    grade_level: str
    subject: str
    duration_minutes: int
    created_at: str
    html_url: str


class GenerateLessonResponse(BaseModel):
    lesson_id: str
    stream_url: str
    message: str = "Lesson generation started"


# ── Student schemas ───────────────────────────────────────────────────────────

class CreateStudentRequest(BaseModel):
    name: str
    grade: str = Field(default="high_school", description="middle_school | high_school | undergraduate")
    subjects: list[str] = Field(default_factory=list)
    notes: str = ""


class StudentProfile(BaseModel):
    student_id: str
    name: str
    grade: str
    subjects: list[str]
    notes: str
    context_files: list[str] = Field(default_factory=list)
    created_at: str


class StudentContextUploadResponse(BaseModel):
    student_id: str
    indexed_chunks: int
    files_processed: list[str]
    message: str


# ── SSE event schemas (for documentation only – sent as raw JSON strings) ─────

class SSEEvent(BaseModel):
    type: str  # node_start | token | node_end | figure_generated | complete | error | heartbeat
    node: Optional[str] = None
    content: Optional[str] = None
    took_ms: Optional[int] = None
    figure_type: Optional[str] = None
    title: Optional[str] = None
    lesson_id: Optional[str] = None
    html_url: Optional[str] = None
    message: Optional[str] = None
