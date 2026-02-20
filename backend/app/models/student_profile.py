"""Student profile model — stores identity quiz results, learning preferences, and resume data."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, String, Text, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class StudentProfile(Base):
    __tablename__ = "student_profiles"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), unique=True, nullable=False)

    # Identity quiz
    quiz_responses = Column(Text, nullable=True)          # JSON: [{question_id, answer_letter, question_text, answer_text}]
    additional_details = Column(Text, nullable=True)       # Free-form text (e.g. "teach me with a southern accent")

    # Resume
    resume_path = Column(Text, nullable=True)              # Filesystem path to uploaded resume
    resume_text = Column(Text, nullable=True)              # Extracted text content from resume

    # AI-generated learning profile
    learning_style_summary = Column(Text, nullable=True)   # AI-generated summary from quiz answers

    # Student metadata
    grade_level = Column(String(50), default="undergraduate")  # middle_school | high_school | undergraduate | professional
    subjects = Column(Text, nullable=True)                 # JSON array of subjects

    # ChromaDB indexing status
    chroma_indexed = Column(Boolean, default=False)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    user = relationship("User", back_populates="student_profile")
