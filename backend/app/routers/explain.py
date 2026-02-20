"""Explain router — AI-powered market explanation."""

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.user import User
from app.models.market import Market
from app.middleware.auth import get_current_user
from app import lmsr
from app.services.ai_client import chat

router = APIRouter(prefix="/api/markets", tags=["explain"])

EXPLAIN_SYSTEM = (
    "You are an educational assistant explaining prediction markets to students. "
    "Explain in plain, friendly language. Keep the explanation to 3-4 sentences. "
    "List 3-5 concrete evidence factors that could shift the probability. "
    "Return ONLY valid JSON, no markdown: "
    '{"explanation": "...", "evidence_factors": ["factor1", ...]}'
)


class ExplainResponse(BaseModel):
    market_id: str
    explanation: str
    evidence_factors: list[str]


@router.post("/{market_id}/explain", response_model=ExplainResponse)
async def explain_market(
    market_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get an AI-generated explanation of a market in plain language."""
    market = db.query(Market).filter(Market.id == market_id).first()
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")

    outcomes = sorted(market.outcomes, key=lambda o: o.display_order)
    q_values = [o.q_value for o in outcomes]
    current_prices = lmsr.prices(q_values, market.b_param) if q_values else []

    outcome_lines = "\n".join(
        f"- {o.label}: {current_prices[i]*100:.1f}% probability"
        for i, o in enumerate(outcomes)
        if i < len(current_prices)
    )

    try:
        raw = await chat(
            system=EXPLAIN_SYSTEM,
            messages=[{
                "role": "user",
                "content": (
                    f"Market: {market.title}\n"
                    f"Description: {market.description or 'No description'}\n"
                    f"Type: {market.market_type}\n"
                    f"Current outcomes:\n{outcome_lines}\n\n"
                    "Explain this market and list evidence factors."
                ),
            }],
            max_tokens=500,
            temperature=0.4,
        )

        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

        result = json.loads(text)
        return ExplainResponse(
            market_id=market_id,
            explanation=result.get("explanation", raw[:400]),
            evidence_factors=result.get("evidence_factors", []),
        )
    except (json.JSONDecodeError, KeyError):
        return ExplainResponse(
            market_id=market_id,
            explanation=raw[:400] if "raw" in dir() else f"This market asks: '{market.title}'. Current odds:\n{outcome_lines}",
            evidence_factors=["Study performance", "Class participation", "Assessment results"],
        )
    except Exception as e:
        return ExplainResponse(
            market_id=market_id,
            explanation=f"This market asks: '{market.title}'.\n{outcome_lines}",
            evidence_factors=["Study performance", "Class participation", "Assessment results"],
        )
