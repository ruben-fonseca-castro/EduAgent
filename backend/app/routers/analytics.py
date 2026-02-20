"""Analytics router — trading flags and participation stats."""

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.user import User
from app.models.trade import Trade
from app.models.market import Market
from app.models.position import Position
from app.models.class_ import ClassEnrollment
from app.schemas.analytics import FlagsResponse, TradingFlag, ParticipationStats
from app.middleware.auth import require_teacher

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/flags", response_model=FlagsResponse)
def get_trading_flags(
    class_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """Get suspicious trading flags for a class.

    Heuristics:
    1. Rapid trades: > 10 trades in 5 minutes
    2. Outsized positions: > 80% of max_position
    3. High daily spend: > 90% of max_daily_spend
    """
    flags = []
    now = datetime.now(timezone.utc)
    five_min_ago = now - timedelta(minutes=5)
    one_day_ago = now - timedelta(days=1)

    # Get all markets in this class
    market_ids = [m.id for m in db.query(Market).filter(Market.class_id == class_id).all()]
    if not market_ids:
        return FlagsResponse(flags=[])

    # Get all students in this class
    students = (
        db.query(User)
        .join(ClassEnrollment, User.id == ClassEnrollment.user_id)
        .filter(ClassEnrollment.class_id == class_id)
        .all()
    )

    for student in students:
        # 1. Rapid trades
        rapid_count = (
            db.query(func.count(Trade.id))
            .filter(
                Trade.user_id == student.id,
                Trade.market_id.in_(market_ids),
                Trade.created_at >= five_min_ago,
            )
            .scalar()
        )
        if rapid_count and rapid_count > 10:
            flags.append(TradingFlag(
                user_id=student.id,
                display_name=student.display_name,
                flag_type="rapid_trades",
                details=f"{rapid_count} trades in last 5 minutes",
                severity="medium",
            ))

        # 2. Check for outsized positions
        positions = (
            db.query(Position)
            .join(Market, Position.market_id == Market.id)
            .filter(
                Position.user_id == student.id,
                Position.market_id.in_(market_ids),
                Position.shares > 0,
            )
            .all()
        )
        for pos in positions:
            market = db.query(Market).filter(Market.id == pos.market_id).first()
            if market and pos.shares > market.max_position * 0.8:
                flags.append(TradingFlag(
                    user_id=student.id,
                    display_name=student.display_name,
                    flag_type="outsized_position",
                    details=f"{pos.shares:.0f}/{market.max_position} shares in '{market.title}'",
                    severity="low" if pos.shares <= market.max_position else "high",
                ))

        # 3. High daily spend
        daily_spend = (
            db.query(func.coalesce(func.sum(Trade.cost), 0.0))
            .filter(
                Trade.user_id == student.id,
                Trade.market_id.in_(market_ids),
                Trade.created_at >= one_day_ago,
                Trade.cost > 0,
            )
            .scalar()
        )
        if daily_spend and daily_spend > 180:  # ~90% of default 200
            flags.append(TradingFlag(
                user_id=student.id,
                display_name=student.display_name,
                flag_type="high_frequency",
                details=f"Daily spend: {daily_spend:.0f} coins",
                severity="low",
            ))

    return FlagsResponse(flags=flags)


@router.get("/participation", response_model=ParticipationStats)
def get_participation(
    class_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """Get participation statistics for a class."""
    total_students = (
        db.query(func.count(ClassEnrollment.id))
        .filter(ClassEnrollment.class_id == class_id)
        .scalar() or 0
    )

    market_ids = [m.id for m in db.query(Market).filter(Market.class_id == class_id).all()]

    if market_ids:
        active_traders = (
            db.query(func.count(func.distinct(Trade.user_id)))
            .filter(Trade.market_id.in_(market_ids))
            .scalar() or 0
        )
        total_trades = (
            db.query(func.count(Trade.id))
            .filter(Trade.market_id.in_(market_ids))
            .scalar() or 0
        )
    else:
        active_traders = 0
        total_trades = 0

    return ParticipationStats(
        class_id=class_id,
        total_students=total_students,
        active_traders=active_traders,
        total_trades=total_trades,
        markets_created=len(market_ids),
        avg_trades_per_student=total_trades / total_students if total_students > 0 else 0,
    )
