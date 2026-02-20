"""Agent summary model — aggregated insights from voice sessions for teachers."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text

from app.database import Base


class AgentSummary(Base):
    __tablename__ = "agent_summaries"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    market_id = Column(String(36), ForeignKey("markets.id"), nullable=False)
    class_id = Column(String(36), ForeignKey("classes.id"), nullable=False)
    misconceptions = Column(Text, nullable=False, default="[]")  # JSON array
    participation_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
