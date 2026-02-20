"""Trade model — immutable audit record of every trade."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Trade(Base):
    __tablename__ = "trades"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    market_id = Column(String(36), ForeignKey("markets.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    outcome_id = Column(String(36), ForeignKey("outcomes.id"), nullable=False)
    shares = Column(Float, nullable=False)
    cost = Column(Float, nullable=False)
    # Store q-vectors and prices as JSON text for full auditability
    before_q = Column(Text, nullable=False)   # JSON string
    after_q = Column(Text, nullable=False)     # JSON string
    before_prices = Column(Text, nullable=False)  # JSON string
    after_prices = Column(Text, nullable=False)   # JSON string
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    # Relationships
    market = relationship("Market", back_populates="trades")
    user = relationship("User", back_populates="trades")
    outcome = relationship("Outcome")
