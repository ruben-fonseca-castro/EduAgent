"""Materialized position model — updated transactionally with each trade."""

import uuid

from sqlalchemy import Column, String, Float, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class Position(Base):
    __tablename__ = "positions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    market_id = Column(String(36), ForeignKey("markets.id"), nullable=False)
    outcome_id = Column(String(36), ForeignKey("outcomes.id"), nullable=False)
    shares = Column(Float, nullable=False, default=0.0)
    avg_cost_per_share = Column(Float, nullable=False, default=0.0)

    __table_args__ = (
        UniqueConstraint("user_id", "market_id", "outcome_id", name="uq_user_market_outcome"),
    )

    # Relationships
    user = relationship("User", back_populates="positions")
    market = relationship("Market")
    outcome = relationship("Outcome")
