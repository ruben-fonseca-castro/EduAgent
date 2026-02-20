"""Voice router — voice session management and multi-agent interaction."""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.market import Market
from app.models.voice_session import VoiceSession
from app.models.agent_summary import AgentSummary
from app.schemas.voice import (
    VoiceSessionCreate,
    VoiceMessageRequest,
    VoiceMessageResponse,
    AgentResponse,
    VoiceSessionResponse,
    ClassInsightsResponse,
)
from app.middleware.auth import get_current_user, require_student, require_teacher
from app.agents.orchestrator import orchestrator

router = APIRouter(prefix="/api/voice", tags=["voice"])


@router.post("/sessions", response_model=VoiceSessionResponse, status_code=201)
def create_session(
    req: VoiceSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Create or resume a voice session for a market."""
    # Check if market exists
    market = db.query(Market).filter(Market.id == req.market_id).first()
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")

    # Check for existing active session
    existing = (
        db.query(VoiceSession)
        .filter(VoiceSession.market_id == req.market_id, VoiceSession.user_id == current_user.id)
        .order_by(VoiceSession.created_at.desc())
        .first()
    )

    if existing and not existing.summary:
        # Resume existing session
        messages = json.loads(existing.messages) if existing.messages else []
        checklist = json.loads(existing.checklist) if existing.checklist else None
        return VoiceSessionResponse(
            id=existing.id,
            market_id=existing.market_id,
            messages=messages,
            summary=existing.summary,
            checklist=checklist,
            created_at=existing.created_at.isoformat(),
        )

    # Create new session
    session = VoiceSession(
        id=str(uuid.uuid4()),
        market_id=req.market_id,
        user_id=current_user.id,
        messages="[]",
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return VoiceSessionResponse(
        id=session.id,
        market_id=session.market_id,
        messages=[],
        summary=None,
        checklist=None,
        created_at=session.created_at.isoformat(),
    )


@router.post("/message", response_model=VoiceMessageResponse)
async def send_message(
    req: VoiceMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Send a message to the multi-agent classroom."""
    session = db.query(VoiceSession).filter(VoiceSession.id == req.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your session")

    # Get market context
    market = db.query(Market).filter(Market.id == session.market_id).first()
    market_context = f"{market.title}: {market.description or ''}" if market else "Unknown topic"

    # Parse existing messages
    messages = json.loads(session.messages) if session.messages else []

    # Process through orchestrator
    result = await orchestrator.process_message(
        student_text=req.text,
        conversation_history=messages,
        market_context=market_context,
        generate_summary=False,
    )

    # Append student message and agent responses to session
    messages.append({"role": "user", "content": req.text, "timestamp": datetime.now(timezone.utc).isoformat()})
    for resp in result["agent_responses"]:
        messages.append({
            "role": "assistant",
            "agent_name": resp["agent_name"],
            "persona": resp["persona"],
            "content": resp["message"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    session.messages = json.dumps(messages)
    session.updated_at = datetime.now(timezone.utc)
    db.commit()

    return VoiceMessageResponse(
        session_id=session.id,
        student_text=req.text,
        agent_responses=[
            AgentResponse(
                agent_name=r["agent_name"],
                persona=r["persona"],
                message=r["message"],
            )
            for r in result["agent_responses"]
        ],
    )


@router.get("/sessions/{session_id}", response_model=VoiceSessionResponse)
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a voice session transcript."""
    session = db.query(VoiceSession).filter(VoiceSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = json.loads(session.messages) if session.messages else []
    checklist = json.loads(session.checklist) if session.checklist else None

    return VoiceSessionResponse(
        id=session.id,
        market_id=session.market_id,
        messages=messages,
        summary=session.summary,
        checklist=checklist,
        created_at=session.created_at.isoformat(),
    )


@router.post("/sessions/{session_id}/summarize", response_model=VoiceSessionResponse)
async def summarize_session_endpoint(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a summary and checklist for a voice session."""
    session = db.query(VoiceSession).filter(VoiceSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    market = db.query(Market).filter(Market.id == session.market_id).first()
    market_title = market.title if market else "Unknown"

    messages = json.loads(session.messages) if session.messages else []

    from app.agents.summarizer import summarize_session
    summary_result = await summarize_session(messages, market_title)

    session.summary = summary_result.get("summary", "")
    session.checklist = json.dumps(summary_result.get("checklist", []))
    session.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)

    return VoiceSessionResponse(
        id=session.id,
        market_id=session.market_id,
        messages=messages,
        summary=session.summary,
        checklist=summary_result.get("checklist", []),
        created_at=session.created_at.isoformat(),
    )


@router.get("/insights/{market_id}", response_model=ClassInsightsResponse)
def get_class_insights(
    market_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """Get aggregated class misconceptions for a market (teacher only).

    Privacy-preserving: only shows aggregated data, no individual student info.
    """
    # Get all sessions for this market
    sessions = db.query(VoiceSession).filter(VoiceSession.market_id == market_id).all()

    all_misconceptions = []
    for session in sessions:
        if session.summary:
            # Parse summary to extract misconceptions
            try:
                checklist = json.loads(session.checklist) if session.checklist else []
                # Use checklist items as proxy for misconceptions in MVP
                all_misconceptions.extend(checklist)
            except (json.JSONDecodeError, TypeError):
                pass

    # Deduplicate (simple approach)
    unique_misconceptions = list(set(all_misconceptions))

    return ClassInsightsResponse(
        market_id=market_id,
        misconceptions=unique_misconceptions[:20],  # Cap at 20
        participation_count=len(sessions),
    )
