"""Trade request/response schemas."""

from pydantic import BaseModel


class TradeQuoteRequest(BaseModel):
    market_id: str
    outcome_id: str
    shares: float  # positive = buy, negative = sell


class TradeQuoteResponse(BaseModel):
    market_id: str
    outcome_id: str
    shares: float
    cost: float
    new_prices: dict[str, float]  # outcome_id -> new price
    current_prices: dict[str, float]


class TradeExecuteRequest(BaseModel):
    market_id: str
    outcome_id: str
    shares: float


class TradeResponse(BaseModel):
    id: str
    market_id: str
    outcome_id: str
    shares: float
    cost: float
    before_prices: dict
    after_prices: dict
    created_at: str

    class Config:
        from_attributes = True


class PositionResponse(BaseModel):
    id: str
    market_id: str
    market_title: str
    market_status: str = "live"
    outcome_id: str
    outcome_label: str
    shares: float
    avg_cost_per_share: float
    current_price: float
    pnl: float
    status: str = "open"

    class Config:
        from_attributes = True


class PortfolioResponse(BaseModel):
    blue_coins: float
    total_invested: float
    positions: list[PositionResponse]
    recent_trades: list[TradeResponse]
