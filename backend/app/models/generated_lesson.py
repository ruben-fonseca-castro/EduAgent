"""Generated lesson model — stores AI-generated personalized lessons."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Column, DateTime, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class GeneratedLesson(Base):
    __tablename__ = "generated_lessons"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    course_id = Column(String(36), ForeignKey("courses.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)

    topic = Column(String(500), nullable=True)
    lesson_plan_json = Column(Text, nullable=True)         # Full LessonPlan as JSON
    html_path = Column(Text, nullable=True)                # Filesystem path to generated HTML
    figures_json = Column(Text, nullable=True)             # JSON array of GeneratedFigure data
    sections_json = Column(Text, nullable=True)            # JSON array of generated sections

    status = Column(String(20), default="generating")      # generating | ready | error
    error_message = Column(Text, nullable=True)
    duration_minutes = Column(Integer, default=30)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    course = relationship("Course", back_populates="generated_lessons")
    user = relationship("User", back_populates="generated_lessons")
