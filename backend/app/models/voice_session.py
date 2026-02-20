"""Voice session model — stores conversation transcripts with AI agents."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.database import Base


class VoiceSession(Base):
    __tablename__ = "voice_sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    market_id = Column(String(36), ForeignKey("markets.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    messages = Column(Text, nullable=False, default="[]")  # JSON array
    summary = Column(Text, nullable=True)
    checklist = Column(Text, nullable=True)  # JSON array
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    user = relationship("User", back_populates="voice_sessions")
    market = relationship("Market")
