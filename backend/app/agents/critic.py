"""Critic agent — checks agent responses for correctness, bias, and safety."""

from app.services.moderation import check_content


CRITIC_SYSTEM_PROMPT = (
    "You are a Quality Critic for an educational AI system. "
    "Review the following agent responses to a student's question. "
    "Check for: "
    "1) Factual accuracy — flag any incorrect statements "
    "2) Bias — flag any biased or one-sided perspectives "
    "3) Safety — flag anything that could be harmful, off-topic, or inappropriate "
    "4) Alignment — ensure responses stay educational and on-topic "
    "5) Clarity — flag confusing or misleading explanations "
    "Return a JSON object with: "
    '{"approved": true/false, "flags": ["list of issues"], "suggestion": "optional improvement"}'
)


def critique_responses(responses: list[dict], student_text: str) -> dict:
    """Run basic safety checks on agent responses.

    For MVP, this does keyword-based moderation. In production,
    this would call Anthropic to evaluate response quality.
    """
    flags = []

    # Check student input
    student_check = check_content(student_text)
    if not student_check["safe"]:
        flags.append(f"Student input flagged: {student_check['reason']}")

    # Check each agent response
    for resp in responses:
        content_check = check_content(resp.get("message", ""))
        if not content_check["safe"]:
            flags.append(f"{resp.get('agent_name', 'Unknown')} response flagged: {content_check['reason']}")

    return {
        "approved": len(flags) == 0,
        "flags": flags,
        "suggestion": None if not flags else "Some content was flagged for review.",
    }
