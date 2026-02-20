"""Class and ClassEnrollment models."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class Class(Base):
    __tablename__ = "classes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    teacher_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    invite_code = Column(String(20), unique=True, nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    # Relationships
    teacher = relationship("User", back_populates="taught_classes")
    enrollments = relationship("ClassEnrollment", back_populates="class_")
    markets = relationship("Market", back_populates="class_")
    courses = relationship("Course", back_populates="class_")


class ClassEnrollment(Base):
    __tablename__ = "class_enrollments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    class_id = Column(String(36), ForeignKey("classes.id"), nullable=False)
    joined_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    # Relationships
    user = relationship("User", back_populates="enrollments")
    class_ = relationship("Class", back_populates="enrollments")
