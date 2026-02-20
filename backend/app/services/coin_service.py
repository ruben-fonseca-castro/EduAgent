"""Coin service — manages Blue Coins economy."""

from sqlalchemy.orm import Session

from app.models.user import User
from app.models.position import Position
from app.models.market import Market
from app.config import settings


def get_balance(db: Session, user_id: str) -> float:
    """Get user's current Blue Coins balance."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("User not found")
    return user.blue_coins


def get_portfolio_value(db: Session, user_id: str) -> dict:
    """Get user's total portfolio value (coins + invested)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("User not found")

    # Sum up value of open positions
    open_positions = (
        db.query(Position)
        .join(Market, Position.market_id == Market.id)
        .filter(Position.user_id == user_id, Market.status == "live", Position.shares > 0)
        .all()
    )
    total_invested = sum(p.shares * p.avg_cost_per_share for p in open_positions)

    return {
        "blue_coins": user.blue_coins,
        "total_invested": total_invested,
        "total_value": user.blue_coins + total_invested,
        "risk_pct": (total_invested / (user.blue_coins + total_invested) * 100)
        if (user.blue_coins + total_invested) > 0
        else 0,
    }


def award_coins(db: Session, user_id: str, amount: float, reason: str) -> float:
    """Award coins to a user (for mini-games, feedback, etc.)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("User not found")
    user.blue_coins += amount
    db.commit()
    return user.blue_coins


def settle_market_payouts(db: Session, market_id: str) -> list[dict]:
    """After a market resolves, pay out winners.

    Winners (those holding shares of the resolved outcome) get 1 coin per share.
    Losers get nothing (their coins were already deducted at trade time).
    """
    market = db.query(Market).filter(Market.id == market_id).first()
    if not market:
        raise ValueError("Market not found")
    if market.status != "resolved":
        raise ValueError("Market must be resolved first")
    if not market.resolved_outcome_id:
        raise ValueError("No resolved outcome set")

    # Find all positions for the winning outcome
    winning_positions = (
        db.query(Position)
        .filter(
            Position.market_id == market_id,
            Position.outcome_id == market.resolved_outcome_id,
            Position.shares > 0,
        )
        .all()
    )

    payouts = []
    for pos in winning_positions:
        user = db.query(User).filter(User.id == pos.user_id).first()
        if user:
            payout = pos.shares  # 1 coin per winning share
            user.blue_coins += payout
            payouts.append({
                "user_id": user.id,
                "display_name": user.display_name,
                "shares": pos.shares,
                "payout": payout,
            })

    market.status = "settled"
    db.commit()
    return payouts
