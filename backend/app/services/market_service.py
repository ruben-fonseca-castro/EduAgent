"""Market service — business logic for market CRUD and lifecycle."""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.market import Market
from app.models.outcome import Outcome
from app.models.audit_log import AuditLog
from app.models.trade import Trade
from app import lmsr


def create_market(
    db: Session,
    creator_id: str,
    class_id: str,
    title: str,
    description: Optional[str],
    market_type: str,
    outcomes: list[dict],
    b_param: float = 100.0,
    max_position: int = 500,
    max_daily_spend: int = 200,
    resolution_source: str = "manual",
) -> Market:
    """Create a new market in draft status with its outcomes."""
    market = Market(
        id=str(uuid.uuid4()),
        class_id=class_id,
        creator_id=creator_id,
        title=title,
        description=description,
        market_type=market_type,
        status="draft",
        b_param=b_param,
        max_position=max_position,
        max_daily_spend=max_daily_spend,
        resolution_source=resolution_source,
    )
    db.add(market)
    db.flush()

    for o in outcomes:
        outcome = Outcome(
            id=str(uuid.uuid4()),
            market_id=market.id,
            label=o["label"],
            q_value=0.0,
            display_order=o.get("display_order", 0),
        )
        db.add(outcome)

    # Audit log
    audit = AuditLog(
        entity_type="market",
        entity_id=market.id,
        action="created",
        actor_id=creator_id,
        new_data=json.dumps({
            "title": title,
            "market_type": market_type,
            "b_param": b_param,
            "outcomes": [o["label"] for o in outcomes],
        }),
    )
    db.add(audit)
    db.commit()
    db.refresh(market)
    return market


def get_market(db: Session, market_id: str) -> Optional[Market]:
    """Get a market by ID with outcomes loaded."""
    return db.query(Market).filter(Market.id == market_id).first()


def list_markets(
    db: Session,
    class_id: Optional[str] = None,
    status: Optional[str] = None,
    market_type: Optional[str] = None,
) -> list[Market]:
    """List markets with optional filters."""
    query = db.query(Market)
    if class_id:
        query = query.filter(Market.class_id == class_id)
    if status:
        query = query.filter(Market.status == status)
    if market_type:
        query = query.filter(Market.market_type == market_type)
    return query.order_by(Market.created_at.desc()).all()


def approve_market(db: Session, market_id: str, actor_id: str) -> Market:
    """Transition market from draft/pending -> live."""
    market = db.query(Market).filter(Market.id == market_id).first()
    if not market:
        raise ValueError("Market not found")
    if market.status not in ("draft", "pending"):
        raise ValueError(f"Cannot approve market in status '{market.status}'")

    old_status = market.status
    market.status = "live"
    market.approved_at = datetime.now(timezone.utc)
    market.live_at = datetime.now(timezone.utc)

    audit = AuditLog(
        entity_type="market",
        entity_id=market.id,
        action="approved",
        actor_id=actor_id,
        old_data=json.dumps({"status": old_status}),
        new_data=json.dumps({"status": "live"}),
    )
    db.add(audit)
    db.commit()
    db.refresh(market)
    return market


def pause_market(db: Session, market_id: str, actor_id: str) -> Market:
    """Pause a live market."""
    market = db.query(Market).filter(Market.id == market_id).first()
    if not market:
        raise ValueError("Market not found")
    if market.status != "live":
        raise ValueError("Can only pause live markets")

    market.status = "pending"

    audit = AuditLog(
        entity_type="market",
        entity_id=market.id,
        action="paused",
        actor_id=actor_id,
        old_data=json.dumps({"status": "live"}),
        new_data=json.dumps({"status": "pending"}),
    )
    db.add(audit)
    db.commit()
    db.refresh(market)
    return market


def resolve_market(db: Session, market_id: str, outcome_id: str, actor_id: str) -> Market:
    """Resolve a market with a winning outcome."""
    market = db.query(Market).filter(Market.id == market_id).first()
    if not market:
        raise ValueError("Market not found")
    if market.status != "live":
        raise ValueError("Can only resolve live markets")

    # Verify outcome belongs to this market
    outcome = db.query(Outcome).filter(
        Outcome.id == outcome_id, Outcome.market_id == market_id
    ).first()
    if not outcome:
        raise ValueError("Outcome not found in this market")

    market.status = "resolved"
    market.resolved_outcome_id = outcome_id
    market.resolved_at = datetime.now(timezone.utc)

    audit = AuditLog(
        entity_type="market",
        entity_id=market.id,
        action="resolved",
        actor_id=actor_id,
        new_data=json.dumps({
            "status": "resolved",
            "resolved_outcome_id": outcome_id,
            "resolved_outcome_label": outcome.label,
        }),
    )
    db.add(audit)
    db.commit()
    db.refresh(market)
    return market


def update_settings(
    db: Session,
    market_id: str,
    actor_id: str,
    b_param: Optional[float] = None,
    max_position: Optional[int] = None,
    max_daily_spend: Optional[int] = None,
) -> Market:
    """Update market settings (b, caps)."""
    market = db.query(Market).filter(Market.id == market_id).first()
    if not market:
        raise ValueError("Market not found")

    old_data = {
        "b_param": market.b_param,
        "max_position": market.max_position,
        "max_daily_spend": market.max_daily_spend,
    }

    if b_param is not None:
        market.b_param = b_param
    if max_position is not None:
        market.max_position = max_position
    if max_daily_spend is not None:
        market.max_daily_spend = max_daily_spend

    new_data = {
        "b_param": market.b_param,
        "max_position": market.max_position,
        "max_daily_spend": market.max_daily_spend,
    }

    audit = AuditLog(
        entity_type="market",
        entity_id=market.id,
        action="settings_changed",
        actor_id=actor_id,
        old_data=json.dumps(old_data),
        new_data=json.dumps(new_data),
    )
    db.add(audit)
    db.commit()
    db.refresh(market)
    return market


def get_sentiment(db: Session, market_id: str) -> dict:
    """Get sentiment (current prices) for a market."""
    market = db.query(Market).filter(Market.id == market_id).first()
    if not market:
        raise ValueError("Market not found")

    q_values = [o.q_value for o in sorted(market.outcomes, key=lambda o: o.display_order)]
    current_prices = lmsr.prices(q_values, market.b_param)

    outcomes = []
    for i, outcome in enumerate(sorted(market.outcomes, key=lambda o: o.display_order)):
        outcomes.append({
            "id": outcome.id,
            "label": outcome.label,
            "price": current_prices[i],
            "percentage": round(current_prices[i] * 100, 1),
        })

    return {
        "market_id": market.id,
        "title": market.title,
        "outcomes": outcomes,
    }


def get_price_history(db: Session, market_id: str) -> list[dict]:
    """Get price history from trade records for charting."""
    trades = (
        db.query(Trade)
        .filter(Trade.market_id == market_id)
        .order_by(Trade.created_at.asc())
        .all()
    )

    history = []
    for trade in trades:
        after_prices = json.loads(trade.after_prices)
        history.append({
            "timestamp": trade.created_at.isoformat(),
            "prices": after_prices,
        })
    return history
