"""Market model."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Market(Base):
    __tablename__ = "markets"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    class_id = Column(String(36), ForeignKey("classes.id"), nullable=False)
    creator_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    market_type = Column(String(20), nullable=False)  # concept | deadline | wellbeing
    status = Column(String(20), nullable=False, default="draft")  # draft | pending | live | resolved | settled
    b_param = Column(Float, nullable=False, default=100.0)
    max_position = Column(Integer, nullable=False, default=500)
    max_daily_spend = Column(Integer, nullable=False, default=200)
    resolution_source = Column(String(20), nullable=False, default="manual")  # manual | csv
    resolved_outcome_id = Column(String(36), ForeignKey("outcomes.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    approved_at = Column(DateTime, nullable=True)
    live_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)

    # Relationships
    class_ = relationship("Class", back_populates="markets")
    creator = relationship("User")
    outcomes = relationship("Outcome", back_populates="market", foreign_keys="[Outcome.market_id]")
    trades = relationship("Trade", back_populates="market")
    resolved_outcome = relationship("Outcome", foreign_keys=[resolved_outcome_id], post_update=True)
