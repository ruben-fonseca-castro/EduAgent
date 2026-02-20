"""Trade service — handles quoting, executing trades, and position management."""

import json
import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.market import Market
from app.models.outcome import Outcome
from app.models.trade import Trade
from app.models.position import Position
from app.models.user import User
from app.config import settings
from app import lmsr


def _get_market_q_and_outcomes(db: Session, market_id: str):
    """Get sorted outcomes and q-vector for a market."""
    market = db.query(Market).filter(Market.id == market_id).first()
    if not market:
        raise ValueError("Market not found")
    if market.status != "live":
        raise ValueError(f"Market is not live (status: {market.status})")

    outcomes = sorted(market.outcomes, key=lambda o: o.display_order)
    q_values = [o.q_value for o in outcomes]
    return market, outcomes, q_values


def _outcome_index(outcomes: list, outcome_id: str) -> int:
    """Find the index of an outcome by ID."""
    for i, o in enumerate(outcomes):
        if o.id == outcome_id:
            return i
    raise ValueError(f"Outcome {outcome_id} not found in market")


def get_quote(db: Session, market_id: str, outcome_id: str, shares: float) -> dict:
    """Get a price quote for a proposed trade without executing it."""
    market, outcomes, q_values = _get_market_q_and_outcomes(db, market_id)
    idx = _outcome_index(outcomes, outcome_id)

    current_prices = lmsr.prices(q_values, market.b_param)
    cost_diff, new_q, new_prices = lmsr.quote(q_values, market.b_param, idx, shares)

    current_price_map = {outcomes[i].id: current_prices[i] for i in range(len(outcomes))}
    new_price_map = {outcomes[i].id: new_prices[i] for i in range(len(outcomes))}

    return {
        "market_id": market_id,
        "outcome_id": outcome_id,
        "shares": shares,
        "cost": cost_diff,
        "current_prices": current_price_map,
        "new_prices": new_price_map,
    }


def _check_risk_cap(db: Session, user: User, proposed_cost: float) -> None:
    """Enforce the 50% portfolio risk cap.

    A student can never allocate more than 50% of their total coin portfolio
    across open positions at once.
    """
    max_risk_pct = settings.MAX_PORTFOLIO_RISK_PCT / 100.0

    # Calculate total value at risk from open positions
    open_positions = (
        db.query(Position)
        .join(Market, Position.market_id == Market.id)
        .filter(Position.user_id == user.id, Market.status == "live", Position.shares > 0)
        .all()
    )
    total_invested = sum(p.shares * p.avg_cost_per_share for p in open_positions)

    total_portfolio = user.blue_coins + total_invested
    if total_portfolio <= 0:
        raise ValueError("Insufficient balance")

    new_total_invested = total_invested + max(proposed_cost, 0)
    if new_total_invested > total_portfolio * max_risk_pct:
        raise ValueError(
            f"Risk cap exceeded: investing {new_total_invested:.1f} of {total_portfolio:.1f} "
            f"would exceed {settings.MAX_PORTFOLIO_RISK_PCT}% limit"
        )


def _check_max_position(db: Session, user_id: str, market: Market, outcome_id: str, new_shares: float) -> None:
    """Enforce max position size per student."""
    position = (
        db.query(Position)
        .filter(Position.user_id == user_id, Position.market_id == market.id, Position.outcome_id == outcome_id)
        .first()
    )
    current_shares = position.shares if position else 0.0
    if current_shares + new_shares > market.max_position:
        raise ValueError(
            f"Position size {current_shares + new_shares:.1f} exceeds max {market.max_position}"
        )


def _check_daily_spend(db: Session, user_id: str, market_id: str, max_daily: int, proposed_cost: float) -> None:
    """Enforce max daily spend per market."""
    since = datetime.now(timezone.utc) - timedelta(days=1)
    daily_spend = (
        db.query(func.coalesce(func.sum(Trade.cost), 0.0))
        .filter(Trade.user_id == user_id, Trade.market_id == market_id, Trade.created_at >= since, Trade.cost > 0)
        .scalar()
    )
    if daily_spend + max(proposed_cost, 0) > max_daily:
        raise ValueError(
            f"Daily spend limit: {daily_spend + proposed_cost:.1f} would exceed {max_daily}"
        )


def execute_trade(db: Session, user_id: str, market_id: str, outcome_id: str, shares: float) -> Trade:
    """Execute a trade with all validation and transactional safety.

    Steps:
    1. Validate market is live
    2. Compute LMSR cost
    3. Check risk cap, position limit, daily spend
    4. Deduct coins from user
    5. Update q-vectors on outcomes
    6. Insert immutable trade record
    7. Update materialized position
    All within a single DB transaction.
    """
    market, outcomes, q_values = _get_market_q_and_outcomes(db, market_id)
    idx = _outcome_index(outcomes, outcome_id)
    user = db.query(User).filter(User.id == user_id).with_for_update().first()
    if not user:
        raise ValueError("User not found")

    # Compute trade
    trade_data = lmsr.execute(q_values, market.b_param, idx, shares)
    cost_diff = trade_data["cost"]

    # Validations
    if cost_diff > 0:
        if user.blue_coins < cost_diff:
            raise ValueError(f"Insufficient coins: have {user.blue_coins:.1f}, need {cost_diff:.1f}")
        _check_risk_cap(db, user, cost_diff)
        _check_daily_spend(db, user_id, market_id, market.max_daily_spend, cost_diff)

    if shares > 0:
        _check_max_position(db, user_id, market, outcome_id, shares)

    # Build price maps for audit
    before_price_map = {outcomes[i].id: trade_data["before_prices"][i] for i in range(len(outcomes))}
    after_price_map = {outcomes[i].id: trade_data["after_prices"][i] for i in range(len(outcomes))}
    before_q_map = {outcomes[i].id: trade_data["before_q"][i] for i in range(len(outcomes))}
    after_q_map = {outcomes[i].id: trade_data["after_q"][i] for i in range(len(outcomes))}

    # 1. Deduct / credit coins
    user.blue_coins -= cost_diff

    # 2. Update q-values on outcome records
    for i, outcome in enumerate(outcomes):
        outcome.q_value = trade_data["after_q"][i]

    # 3. Insert immutable trade record
    trade = Trade(
        id=str(uuid.uuid4()),
        market_id=market_id,
        user_id=user_id,
        outcome_id=outcome_id,
        shares=shares,
        cost=cost_diff,
        before_q=json.dumps(before_q_map),
        after_q=json.dumps(after_q_map),
        before_prices=json.dumps(before_price_map),
        after_prices=json.dumps(after_price_map),
    )
    db.add(trade)

    # 4. Update materialized position
    position = (
        db.query(Position)
        .filter(
            Position.user_id == user_id,
            Position.market_id == market_id,
            Position.outcome_id == outcome_id,
        )
        .first()
    )
    if position:
        if shares > 0:
            # Weighted average cost
            total_cost = position.shares * position.avg_cost_per_share + cost_diff
            position.shares += shares
            position.avg_cost_per_share = total_cost / position.shares if position.shares > 0 else 0
        else:
            position.shares += shares  # shares is negative for sells
            if position.shares <= 0:
                position.shares = 0
                position.avg_cost_per_share = 0
    else:
        position = Position(
            id=str(uuid.uuid4()),
            user_id=user_id,
            market_id=market_id,
            outcome_id=outcome_id,
            shares=shares,
            avg_cost_per_share=cost_diff / shares if shares != 0 else 0,
        )
        db.add(position)

    db.commit()
    db.refresh(trade)
    return trade


def get_user_positions(db: Session, user_id: str) -> list[dict]:
    """Get all positions for a user with current prices and PnL."""
    positions = (
        db.query(Position)
        .filter(Position.user_id == user_id, Position.shares > 0)
        .all()
    )

    result = []
    for pos in positions:
        market = db.query(Market).filter(Market.id == pos.market_id).first()
        outcome = db.query(Outcome).filter(Outcome.id == pos.outcome_id).first()
        if not market or not outcome:
            continue

        outcomes = sorted(market.outcomes, key=lambda o: o.display_order)
        q_values = [o.q_value for o in outcomes]

        if market.status in ("resolved", "settled"):
            # For resolved markets, final price is 1.0 for winner, 0.0 for losers
            is_winner = (pos.outcome_id == market.resolved_outcome_id)
            current_price = 1.0 if is_winner else 0.0
            pnl = (current_price - pos.avg_cost_per_share) * pos.shares
            position_status = "won" if is_winner else "lost"
        else:
            current_prices = lmsr.prices(q_values, market.b_param)
            outcome_idx = next(i for i, o in enumerate(outcomes) if o.id == pos.outcome_id)
            current_price = current_prices[outcome_idx]
            pnl = (current_price - pos.avg_cost_per_share) * pos.shares
            position_status = "open"

        result.append({
            "id": pos.id,
            "market_id": pos.market_id,
            "market_title": market.title,
            "market_status": market.status,
            "outcome_id": pos.outcome_id,
            "outcome_label": outcome.label,
            "shares": pos.shares,
            "avg_cost_per_share": pos.avg_cost_per_share,
            "current_price": current_price,
            "pnl": pnl,
            "status": position_status,
        })
    return result


def get_user_trades(db: Session, user_id: str, limit: int = 50) -> list[Trade]:
    """Get recent trades for a user."""
    return (
        db.query(Trade)
        .filter(Trade.user_id == user_id)
        .order_by(Trade.created_at.desc())
        .limit(limit)
        .all()
    )
