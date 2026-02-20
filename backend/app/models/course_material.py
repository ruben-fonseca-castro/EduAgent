"""Course material model — uploaded files (PDFs, images, videos, docs)."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Integer
from sqlalchemy.orm import relationship

from app.database import Base


class CourseMaterial(Base):
    __tablename__ = "course_materials"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id = Column(String(36), ForeignKey("courses.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    file_type = Column(String(20), nullable=False)  # pdf, image, video, doc
    file_path = Column(Text, nullable=False)
    file_size = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="processing")  # processing, ready, error
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    # Relationships
    course = relationship("Course", back_populates="materials")
    chunks = relationship("MaterialChunk", back_populates="material", cascade="all, delete-orphan")
