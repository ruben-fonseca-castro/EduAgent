"""Classroom session request/response schemas."""

from typing import Optional
from pydantic import BaseModel


class ClassroomSessionCreate(BaseModel):
    course_id: str
    lesson_id: Optional[str] = None


class ClassroomMessageRequest(BaseModel):
    session_id: str
    text: str
    personas: list[str] = []  # empty = all; list of persona keys to respond


class AvatarState(BaseModel):
    """Visual state for an AI avatar in the classroom."""
    animation: str = "idle"  # idle, thinking, confused, nodding, hand_raised, enlightened


class ClassroomAgentResponse(BaseModel):
    agent_name: str
    persona: str
    message: str
    avatar_state: AvatarState = AvatarState()


class ClassroomMessageResponse(BaseModel):
    session_id: str
    student_text: str
    agent_responses: list[ClassroomAgentResponse]
    teaching_score: float = 0.0
    supervisor_feedback: Optional[str] = None
    topics_covered: list[str] = []
    coins_earned: float = 0.0


class ClassroomSessionResponse(BaseModel):
    id: str
    course_id: str
    messages: list[dict]
    teaching_score: float
    topics_covered: list[str]
    style_profile: Optional[dict] = None
    summary: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True


class TeachingEvaluation(BaseModel):
    session_id: str
    teaching_score: float
    strengths: list[str]
    areas_to_improve: list[str]
    style_profile: dict
    summary: str


class StyleProfile(BaseModel):
    uses_analogies: float = 0.0
    uses_examples: float = 0.0
    breaks_down_steps: float = 0.0
    checks_understanding: float = 0.0
    accuracy: float = 0.0


class PerformanceReportSummary(BaseModel):
    """Lightweight performance report summary for teacher dashboard."""
    id: str
    session_id: str
    teaching_score: float
    strengths: list[str]
    weaknesses: list[str]
    topics_strong: list[str]
    topics_weak: list[str]
    created_at: str


class StudentReport(BaseModel):
    user_id: str
    display_name: str
    total_sessions: int
    total_messages: int
    avg_teaching_score: float
    best_teaching_score: float
    last_session_at: Optional[str]
    topics_covered: list[str]
    style_profile: Optional[StyleProfile]
    session_scores: list[float]      # score per session over time
    session_dates: list[str]         # ISO dates per session
    strengths: list[str]
    areas_to_improve: list[str]
    engagement_level: str            # "low" | "medium" | "high"
    # Student profile data (from identity quiz)
    quiz_completed: bool = False
    grade_level: Optional[str] = None
    learning_style_summary: Optional[str] = None
    subjects: list[str] = []
    resume_uploaded: bool = False
    # Lesson & report data
    lessons_generated: int = 0
    performance_reports: list[PerformanceReportSummary] = []


class ClassDemographics(BaseModel):
    """Class-wide demographics from student identity quizzes."""
    total_students: int = 0
    quiz_completion_rate: float = 0.0          # 0.0 – 1.0
    grade_distribution: dict[str, int] = {}    # grade_level → count
    common_subjects: list[str] = []            # most common subjects
    avg_lessons_per_student: float = 0.0
    total_lessons_generated: int = 0
    total_performance_reports: int = 0
    avg_report_score: float = 0.0


class ClassroomAnalytics(BaseModel):
    course_id: str
    # Aggregate stats
    total_sessions: int
    avg_teaching_score: float
    active_students: int
    common_topics: list[str]
    # Distribution
    score_distribution: dict[str, int]   # "0-20", "21-40", etc. → count
    avg_messages_per_session: float
    total_messages: int
    # Engagement
    high_engagement_count: int
    medium_engagement_count: int
    low_engagement_count: int
    # Style aggregate across all students
    class_style_profile: Optional[StyleProfile]
    # Per-student breakdown
    student_reports: list[StudentReport]
    # Class demographics (from student profiles)
    class_demographics: Optional[ClassDemographics] = None
