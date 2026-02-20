"""Resume Builder state model — stores structured resume JSON and pending suggestions per student."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Column, DateTime, String, Text, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class ResumeBuilderState(Base):
    __tablename__ = "resume_builder_states"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), unique=True, nullable=False)

    # Full structured resume as JSON
    resume_json = Column(Text, nullable=True)  # JSON: {basics, education, experience, projects, skills}

    # Pending AI suggestions as JSON array
    suggestions_json = Column(Text, nullable=True)  # JSON: [{id, originalText, proposedText, explanation, status}]

    # Chat history for the resume builder session
    chat_history = Column(Text, nullable=True)  # JSON: [{role, content}]

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User")
