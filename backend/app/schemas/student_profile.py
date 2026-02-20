"""Student profile and identity quiz schemas."""

from typing import Optional
from pydantic import BaseModel


class QuizAnswer(BaseModel):
    question_id: int
    answer: str  # "A", "B", "C", or "D"


class IdentityQuizSubmission(BaseModel):
    answers: list[QuizAnswer]
    additional_details: str = ""
    grade_level: str = "undergraduate"
    subjects: list[str] = []


class StudentProfileResponse(BaseModel):
    id: str
    user_id: str
    quiz_completed: bool
    learning_style_summary: Optional[str] = None
    grade_level: str
    subjects: list[str]
    additional_details: Optional[str] = None
    resume_uploaded: bool
    created_at: str

    class Config:
        from_attributes = True


class QuizCheckResponse(BaseModel):
    quiz_completed: bool
    profile_id: Optional[str] = None


class LessonResponse(BaseModel):
    id: str
    course_id: str
    user_id: str
    topic: str
    status: str
    html_content: Optional[str] = None
    sections_json: Optional[str] = None
    figures_json: Optional[str] = None
    duration_minutes: Optional[int] = None
    error_message: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True


class LessonGenerateRequest(BaseModel):
    course_id: str


class LessonGenerateResponse(BaseModel):
    lesson_id: str
    status: str


class PerformanceReportRequest(BaseModel):
    pass  # No body needed — session_id is in the URL


class PerformanceReportResponse(BaseModel):
    id: str
    session_id: str
    user_id: str
    course_id: str
    lesson_id: Optional[str] = None
    teaching_score: float
    strengths: list[str]
    weaknesses: list[str]
    topics_strong: list[str]
    topics_weak: list[str]
    full_report_text: str
    created_at: str

    class Config:
        from_attributes = True
