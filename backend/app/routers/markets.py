"""Markets router — CRUD, lifecycle, sentiment, and price history."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.market import (
    MarketCreate,
    MarketSettingsUpdate,
    MarketResolve,
    MarketResponse,
    MarketListResponse,
    OutcomeResponse,
    SentimentResponse,
    PriceHistoryResponse,
    PriceHistoryPoint,
)
from app.middleware.auth import get_current_user, require_teacher
from app.services import market_service
from app.services.moderation import moderate_market_content
from app.services.coin_service import settle_market_payouts
from app import lmsr

router = APIRouter(prefix="/api/markets", tags=["markets"])


def _market_to_response(market) -> MarketResponse:
    """Convert a Market ORM model to a response schema."""
    outcomes = sorted(market.outcomes, key=lambda o: o.display_order)
    q_values = [o.q_value for o in outcomes]

    if q_values:
        current_prices = lmsr.prices(q_values, market.b_param)
    else:
        current_prices = []

    outcome_responses = []
    for i, o in enumerate(outcomes):
        outcome_responses.append(OutcomeResponse(
            id=o.id,
            label=o.label,
            q_value=o.q_value,
            price=current_prices[i] if i < len(current_prices) else 0.0,
            display_order=o.display_order,
        ))

    return MarketResponse(
        id=market.id,
        class_id=market.class_id,
        creator_id=market.creator_id,
        title=market.title,
        description=market.description,
        market_type=market.market_type,
        status=market.status,
        b_param=market.b_param,
        max_position=market.max_position,
        max_daily_spend=market.max_daily_spend,
        resolution_source=market.resolution_source,
        resolved_outcome_id=market.resolved_outcome_id,
        created_at=market.created_at.isoformat() if market.created_at else "",
        approved_at=market.approved_at.isoformat() if market.approved_at else None,
        live_at=market.live_at.isoformat() if market.live_at else None,
        resolved_at=market.resolved_at.isoformat() if market.resolved_at else None,
        outcomes=outcome_responses,
    )


@router.post("", response_model=MarketResponse, status_code=201)
def create_market(
    req: MarketCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """Create a new market (teacher only)."""
    # Moderation check
    mod_result = moderate_market_content(req.title, req.description or "")
    if not mod_result["safe"]:
        raise HTTPException(status_code=400, detail=mod_result["reason"])

    if req.market_type not in ("concept", "deadline", "wellbeing"):
        raise HTTPException(status_code=400, detail="Invalid market_type")

    if len(req.outcomes) < 2:
        raise HTTPException(status_code=400, detail="Market must have at least 2 outcomes")

    market = market_service.create_market(
        db=db,
        creator_id=current_user.id,
        class_id=req.class_id,
        title=req.title,
        description=req.description,
        market_type=req.market_type,
        outcomes=[{"label": o.label, "display_order": o.display_order} for o in req.outcomes],
        b_param=req.b_param,
        max_position=req.max_position,
        max_daily_spend=req.max_daily_spend,
        resolution_source=req.resolution_source,
    )
    return _market_to_response(market)


@router.get("", response_model=MarketListResponse)
def list_markets(
    class_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    market_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List markets with optional filters."""
    markets = market_service.list_markets(db, class_id=class_id, status=status, market_type=market_type)
    return MarketListResponse(
        markets=[_market_to_response(m) for m in markets],
        total=len(markets),
    )


@router.get("/{market_id}", response_model=MarketResponse)
def get_market(
    market_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get market detail with outcomes and current prices."""
    market = market_service.get_market(db, market_id)
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")
    return _market_to_response(market)


@router.patch("/{market_id}/approve", response_model=MarketResponse)
def approve_market(
    market_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """Approve a market (draft/pending -> live)."""
    try:
        market = market_service.approve_market(db, market_id, current_user.id)
        return _market_to_response(market)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{market_id}/pause", response_model=MarketResponse)
def pause_market(
    market_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """Pause a live market."""
    try:
        market = market_service.pause_market(db, market_id, current_user.id)
        return _market_to_response(market)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{market_id}/resolve", response_model=MarketResponse)
def resolve_market(
    market_id: str,
    req: MarketResolve,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """Resolve a market with a winning outcome."""
    try:
        market = market_service.resolve_market(db, market_id, req.outcome_id, current_user.id)
        # Auto-settle payouts
        try:
            settle_market_payouts(db, market_id)
        except Exception as e:
            pass  # Market resolved but settle failed - can retry
        return _market_to_response(market)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{market_id}/settings", response_model=MarketResponse)
def update_settings(
    market_id: str,
    req: MarketSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """Update market settings (b, caps)."""
    try:
        market = market_service.update_settings(
            db,
            market_id,
            current_user.id,
            b_param=req.b_param,
            max_position=req.max_position,
            max_daily_spend=req.max_daily_spend,
        )
        return _market_to_response(market)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{market_id}/sentiment", response_model=SentimentResponse)
def get_sentiment(
    market_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """Get aggregated sentiment for a market."""
    try:
        return market_service.get_sentiment(db, market_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{market_id}/history", response_model=PriceHistoryResponse)
def get_price_history(
    market_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get price history for a market (for odds chart)."""
    history = market_service.get_price_history(db, market_id)
    return PriceHistoryResponse(
        market_id=market_id,
        history=[PriceHistoryPoint(**h) for h in history],
    )
