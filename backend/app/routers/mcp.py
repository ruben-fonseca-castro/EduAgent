"""MCP (Model Context Protocol) tool server — exposes tools for agent orchestration."""

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.analytics import MCPToolsResponse, MCPToolSchema, MCPCallRequest, MCPCallResponse
from app.middleware.auth import get_current_user
from app.services import market_service, trade_service

router = APIRouter(prefix="/api/mcp", tags=["mcp"])

# Tool definitions
MCP_TOOLS = [
    MCPToolSchema(
        name="tools.market.create",
        description="Create a new prediction market",
        parameters={
            "type": "object",
            "properties": {
                "class_id": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "market_type": {"type": "string", "enum": ["concept", "deadline", "wellbeing"]},
                "outcomes": {"type": "array", "items": {"type": "object", "properties": {"label": {"type": "string"}}}},
                "b_param": {"type": "number", "default": 100},
            },
            "required": ["class_id", "title", "market_type", "outcomes"],
        },
    ),
    MCPToolSchema(
        name="tools.market.list",
        description="List prediction markets with optional filters",
        parameters={
            "type": "object",
            "properties": {
                "class_id": {"type": "string"},
                "status": {"type": "string", "enum": ["draft", "pending", "live", "resolved", "settled"]},
                "market_type": {"type": "string"},
            },
        },
    ),
    MCPToolSchema(
        name="tools.market.resolve",
        description="Resolve a market with a winning outcome",
        parameters={
            "type": "object",
            "properties": {
                "market_id": {"type": "string"},
                "outcome_id": {"type": "string"},
            },
            "required": ["market_id", "outcome_id"],
        },
    ),
    MCPToolSchema(
        name="tools.trade.quote",
        description="Get a price quote for a trade",
        parameters={
            "type": "object",
            "properties": {
                "market_id": {"type": "string"},
                "outcome_id": {"type": "string"},
                "shares": {"type": "number"},
            },
            "required": ["market_id", "outcome_id", "shares"],
        },
    ),
    MCPToolSchema(
        name="tools.trade.execute",
        description="Execute a trade",
        parameters={
            "type": "object",
            "properties": {
                "market_id": {"type": "string"},
                "outcome_id": {"type": "string"},
                "shares": {"type": "number"},
                "user_id": {"type": "string"},
            },
            "required": ["market_id", "outcome_id", "shares", "user_id"],
        },
    ),
    MCPToolSchema(
        name="tools.analytics.flags",
        description="Get suspicious trading flags for a class",
        parameters={
            "type": "object",
            "properties": {
                "class_id": {"type": "string"},
            },
            "required": ["class_id"],
        },
    ),
    MCPToolSchema(
        name="tools.voice.session_summarize",
        description="Summarize a voice session",
        parameters={
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
            },
            "required": ["session_id"],
        },
    ),
]


@router.post("/tools", response_model=MCPToolsResponse)
def list_tools(current_user: User = Depends(get_current_user)):
    """List available MCP tools and their schemas."""
    return MCPToolsResponse(tools=MCP_TOOLS)


@router.post("/call", response_model=MCPCallResponse)
def call_tool(
    req: MCPCallRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Execute an MCP tool call."""
    try:
        if req.tool_name == "tools.market.list":
            markets = market_service.list_markets(
                db,
                class_id=req.arguments.get("class_id"),
                status=req.arguments.get("status"),
                market_type=req.arguments.get("market_type"),
            )
            return MCPCallResponse(result={
                "markets": [{"id": m.id, "title": m.title, "status": m.status} for m in markets],
            })

        elif req.tool_name == "tools.market.create":
            market = market_service.create_market(
                db=db,
                creator_id=current_user.id,
                class_id=req.arguments["class_id"],
                title=req.arguments["title"],
                description=req.arguments.get("description"),
                market_type=req.arguments["market_type"],
                outcomes=[{"label": o["label"], "display_order": i} for i, o in enumerate(req.arguments["outcomes"])],
                b_param=req.arguments.get("b_param", 100.0),
            )
            return MCPCallResponse(result={"market_id": market.id, "status": market.status})

        elif req.tool_name == "tools.market.resolve":
            market = market_service.resolve_market(
                db,
                req.arguments["market_id"],
                req.arguments["outcome_id"],
                current_user.id,
            )
            return MCPCallResponse(result={"market_id": market.id, "status": market.status})

        elif req.tool_name == "tools.trade.quote":
            quote = trade_service.get_quote(
                db,
                req.arguments["market_id"],
                req.arguments["outcome_id"],
                req.arguments["shares"],
            )
            return MCPCallResponse(result=quote)

        elif req.tool_name == "tools.trade.execute":
            trade = trade_service.execute_trade(
                db,
                req.arguments["user_id"],
                req.arguments["market_id"],
                req.arguments["outcome_id"],
                req.arguments["shares"],
            )
            return MCPCallResponse(result={"trade_id": trade.id, "cost": trade.cost})

        elif req.tool_name == "tools.analytics.flags":
            # Delegate to analytics logic (simplified)
            return MCPCallResponse(result={"flags": []})

        elif req.tool_name == "tools.voice.session_summarize":
            return MCPCallResponse(result={"status": "summarize_not_implemented_in_sync"})

        else:
            raise HTTPException(status_code=400, detail=f"Unknown tool: {req.tool_name}")

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Missing required argument: {e}")
