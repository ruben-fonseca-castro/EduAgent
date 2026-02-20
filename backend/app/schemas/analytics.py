"""Analytics schemas."""

from pydantic import BaseModel


class TradingFlag(BaseModel):
    user_id: str
    display_name: str
    flag_type: str  # rapid_trades | outsized_position | high_frequency
    details: str
    severity: str  # low | medium | high


class FlagsResponse(BaseModel):
    flags: list[TradingFlag]


class ParticipationStats(BaseModel):
    class_id: str
    total_students: int
    active_traders: int
    total_trades: int
    markets_created: int
    avg_trades_per_student: float


class MCPToolSchema(BaseModel):
    name: str
    description: str
    parameters: dict


class MCPToolsResponse(BaseModel):
    tools: list[MCPToolSchema]


class MCPCallRequest(BaseModel):
    tool_name: str
    arguments: dict


class MCPCallResponse(BaseModel):
    result: dict
