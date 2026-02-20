"""Course model — a teacher-created course for classroom sessions."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Course(Base):
    __tablename__ = "courses"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    class_id = Column(String(36), ForeignKey("classes.id"), nullable=False)
    teacher_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    teacher = relationship("User", back_populates="courses")
    class_ = relationship("Class", back_populates="courses")
    materials = relationship("CourseMaterial", back_populates="course", cascade="all, delete-orphan")
    classroom_sessions = relationship("ClassroomSession", back_populates="course")
    generated_lessons = relationship("GeneratedLesson", back_populates="course")
