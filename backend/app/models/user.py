"""User model."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Float, DateTime, Integer
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="student")  # student | teacher
    display_name = Column(String(255), nullable=False)
    blue_coins = Column(Float, nullable=False, default=1000.0)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    # Relationships
    trades = relationship("Trade", back_populates="user")
    positions = relationship("Position", back_populates="user")
    taught_classes = relationship("Class", back_populates="teacher")
    enrollments = relationship("ClassEnrollment", back_populates="user")
    voice_sessions = relationship("VoiceSession", back_populates="user")
    courses = relationship("Course", back_populates="teacher")
    classroom_sessions = relationship("ClassroomSession", back_populates="user")
    student_profile = relationship("StudentProfile", back_populates="user", uselist=False)
    generated_lessons = relationship("GeneratedLesson", back_populates="user")
    performance_reports = relationship("PerformanceReport", back_populates="user")
