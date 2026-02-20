"""Voice session request/response schemas."""

from typing import Optional
from pydantic import BaseModel


class VoiceSessionCreate(BaseModel):
    market_id: str


class VoiceMessageRequest(BaseModel):
    session_id: str
    text: str


class AgentResponse(BaseModel):
    agent_name: str
    persona: str
    message: str


class VoiceMessageResponse(BaseModel):
    session_id: str
    student_text: str
    agent_responses: list[AgentResponse]
    checklist: Optional[list[str]] = None


class VoiceSessionResponse(BaseModel):
    id: str
    market_id: str
    messages: list[dict]
    summary: Optional[str]
    checklist: Optional[list[str]]
    created_at: str

    class Config:
        from_attributes = True


class ClassInsightsResponse(BaseModel):
    market_id: str
    misconceptions: list[str]
    participation_count: int
