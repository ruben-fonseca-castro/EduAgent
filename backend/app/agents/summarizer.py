"""Summarizer agent — produces study checklists and misconception summaries."""

import json
from app.services.ai_client import chat

SUMMARIZER_SYSTEM = (
    "You are a Study Summarizer for an educational platform. "
    "Given a conversation between a student and AI tutoring agents, produce: "
    "1) A concise summary of what was discussed (2-3 sentences) "
    "2) A checklist of key study items the student should review "
    "3) A list of misconceptions identified during the conversation "
    "Return ONLY valid JSON, no markdown fences: "
    '{"summary": "...", "checklist": ["item1", ...], "misconceptions": ["m1", ...]}'
)


async def summarize_session(messages: list[dict], market_title: str) -> dict:
    """Summarize a voice session into a study checklist."""
    conversation_text = "\n".join(
        f"{'Student' if m.get('role') == 'user' else m.get('agent_name', 'Agent')}: {m.get('content', '')}"
        for m in messages
    )

    try:
        raw = await chat(
            system=SUMMARIZER_SYSTEM,
            messages=[{
                "role": "user",
                "content": (
                    f"Market topic: {market_title}\n\n"
                    f"Conversation:\n{conversation_text}\n\n"
                    "Produce the JSON summary."
                ),
            }],
            max_tokens=800,
            temperature=0.3,
        )

        # Strip markdown fences if present
        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

        result = json.loads(text)
        return {
            "summary": result.get("summary", ""),
            "checklist": result.get("checklist", []),
            "misconceptions": result.get("misconceptions", []),
        }
    except json.JSONDecodeError:
        # LLM returned non-JSON — treat the raw text as the summary
        return {
            "summary": raw[:500] if "raw" in dir() else f"Session about: {market_title}",
            "checklist": ["Review the core concepts discussed"],
            "misconceptions": [],
        }
    except Exception as e:
        return {
            "summary": f"Summarization unavailable: {e}",
            "checklist": ["Review the core concepts discussed"],
            "misconceptions": [],
        }
