"""Outcome model."""

import uuid

from sqlalchemy import Column, String, Float, Integer, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class Outcome(Base):
    __tablename__ = "outcomes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    market_id = Column(String(36), ForeignKey("markets.id"), nullable=False)
    label = Column(String(255), nullable=False)
    q_value = Column(Float, nullable=False, default=0.0)
    display_order = Column(Integer, nullable=False, default=0)

    # Relationships
    market = relationship("Market", back_populates="outcomes", foreign_keys=[market_id])
