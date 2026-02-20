"""Trades router — quoting, execution, positions, and portfolio."""

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.trade import (
    TradeQuoteRequest,
    TradeQuoteResponse,
    TradeExecuteRequest,
    TradeResponse,
    PositionResponse,
    PortfolioResponse,
)
from app.middleware.auth import get_current_user, require_student
from app.services import trade_service, coin_service

router = APIRouter(prefix="/api", tags=["trades"])


@router.post("/trades/quote", response_model=TradeQuoteResponse)
def quote_trade(
    req: TradeQuoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Get a price quote for a proposed trade."""
    try:
        result = trade_service.get_quote(db, req.market_id, req.outcome_id, req.shares)
        return TradeQuoteResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/trades/execute", response_model=TradeResponse)
def execute_trade(
    req: TradeExecuteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Execute a trade."""
    try:
        trade = trade_service.execute_trade(
            db, current_user.id, req.market_id, req.outcome_id, req.shares
        )
        return TradeResponse(
            id=trade.id,
            market_id=trade.market_id,
            outcome_id=trade.outcome_id,
            shares=trade.shares,
            cost=trade.cost,
            before_prices=json.loads(trade.before_prices),
            after_prices=json.loads(trade.after_prices),
            created_at=trade.created_at.isoformat(),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/trades/my", response_model=list[TradeResponse])
def my_trades(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current user's trade history."""
    trades = trade_service.get_user_trades(db, current_user.id)
    return [
        TradeResponse(
            id=t.id,
            market_id=t.market_id,
            outcome_id=t.outcome_id,
            shares=t.shares,
            cost=t.cost,
            before_prices=json.loads(t.before_prices),
            after_prices=json.loads(t.after_prices),
            created_at=t.created_at.isoformat(),
        )
        for t in trades
    ]


@router.get("/positions/my", response_model=list[PositionResponse])
def my_positions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current user's open positions with PnL."""
    positions = trade_service.get_user_positions(db, current_user.id)
    return [PositionResponse(**p) for p in positions]


@router.get("/portfolio/my", response_model=PortfolioResponse)
def my_portfolio(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current user's full portfolio summary."""
    portfolio = coin_service.get_portfolio_value(db, current_user.id)
    positions = trade_service.get_user_positions(db, current_user.id)
    trades = trade_service.get_user_trades(db, current_user.id, limit=10)

    return PortfolioResponse(
        blue_coins=portfolio["blue_coins"],
        total_invested=portfolio["total_invested"],
        positions=[PositionResponse(**p) for p in positions],
        recent_trades=[
            TradeResponse(
                id=t.id,
                market_id=t.market_id,
                outcome_id=t.outcome_id,
                shares=t.shares,
                cost=t.cost,
                before_prices=json.loads(t.before_prices),
                after_prices=json.loads(t.after_prices),
                created_at=t.created_at.isoformat(),
            )
            for t in trades
        ],
    )
