"""Market request/response schemas."""

from typing import Optional
from pydantic import BaseModel


class OutcomeCreate(BaseModel):
    label: str
    display_order: int = 0


class MarketCreate(BaseModel):
    class_id: str
    title: str
    description: Optional[str] = None
    market_type: str  # concept | deadline | wellbeing
    outcomes: list[OutcomeCreate]
    b_param: float = 100.0
    max_position: int = 500
    max_daily_spend: int = 200
    resolution_source: str = "manual"


class MarketSettingsUpdate(BaseModel):
    b_param: Optional[float] = None
    max_position: Optional[int] = None
    max_daily_spend: Optional[int] = None


class MarketResolve(BaseModel):
    outcome_id: str


class OutcomeResponse(BaseModel):
    id: str
    label: str
    q_value: float
    price: float = 0.0
    display_order: int

    class Config:
        from_attributes = True


class MarketResponse(BaseModel):
    id: str
    class_id: str
    creator_id: str
    title: str
    description: Optional[str]
    market_type: str
    status: str
    b_param: float
    max_position: int
    max_daily_spend: int
    resolution_source: str
    resolved_outcome_id: Optional[str]
    created_at: str
    approved_at: Optional[str]
    live_at: Optional[str]
    resolved_at: Optional[str]
    outcomes: list[OutcomeResponse] = []

    class Config:
        from_attributes = True


class MarketListResponse(BaseModel):
    markets: list[MarketResponse]
    total: int


class SentimentResponse(BaseModel):
    market_id: str
    title: str
    outcomes: list[dict]  # [{label, price, percentage}]


class PriceHistoryPoint(BaseModel):
    timestamp: str
    prices: dict[str, float]  # outcome_label -> price


class PriceHistoryResponse(BaseModel):
    market_id: str
    history: list[PriceHistoryPoint]
