"""Audit log model — immutable record of every significant action."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, ForeignKey, Text

from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    entity_type = Column(String(50), nullable=False)  # market | trade | user | etc.
    entity_id = Column(String(36), nullable=False)
    action = Column(String(50), nullable=False)  # created | approved | resolved | settings_changed | ...
    actor_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    old_data = Column(Text, nullable=True)   # JSON string
    new_data = Column(Text, nullable=True)   # JSON string
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
