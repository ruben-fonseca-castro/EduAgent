"""Classroom session model — tracks learn-by-teaching sessions."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Float
from sqlalchemy.orm import relationship

from app.database import Base


class ClassroomSession(Base):
    __tablename__ = "classroom_sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id = Column(String(36), ForeignKey("courses.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    lesson_id = Column(String(36), ForeignKey("generated_lessons.id"), nullable=True)
    messages = Column(Text, nullable=False, default="[]")  # JSON array
    teaching_score = Column(Float, nullable=False, default=0.0)
    topics_covered = Column(Text, nullable=True)  # JSON array
    style_profile = Column(Text, nullable=True)  # JSON object tracking teaching style
    summary = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    user = relationship("User", back_populates="classroom_sessions")
    course = relationship("Course", back_populates="classroom_sessions")
    lesson = relationship("GeneratedLesson", lazy="select")
    performance_report = relationship("PerformanceReport", back_populates="session", uselist=False)
