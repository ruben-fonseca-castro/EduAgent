"""Performance report model — stores teaching session evaluation results."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, Float, String, Text, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class PerformanceReport(Base):
    __tablename__ = "performance_reports"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    session_id = Column(String(36), ForeignKey("classroom_sessions.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    course_id = Column(String(36), ForeignKey("courses.id"), nullable=False)
    lesson_id = Column(String(36), ForeignKey("generated_lessons.id"), nullable=True)

    teaching_score = Column(Float, default=0.0)
    strengths = Column(Text, nullable=True)                # JSON array of strings
    weaknesses = Column(Text, nullable=True)               # JSON array of strings
    topics_strong = Column(Text, nullable=True)            # JSON array of strings
    topics_weak = Column(Text, nullable=True)              # JSON array of strings
    style_profile = Column(Text, nullable=True)            # JSON object
    full_report_text = Column(Text, nullable=True)         # AI-generated full narrative summary

    indexed_in_rag = Column(Boolean, default=False)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    session = relationship("ClassroomSession", back_populates="performance_report")
    user = relationship("User", back_populates="performance_reports")
    course = relationship("Course")
    lesson = relationship("GeneratedLesson")
