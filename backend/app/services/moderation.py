"""Basic content moderation service."""

BLOCKED_KEYWORDS = [
    "gambling", "bet real money", "cash out", "wire transfer",
    "medical advice", "legal advice", "diagnosis", "prescription",
    "hate", "violence", "explicit", "illegal",
]


def check_content(text: str) -> dict:
    """Check text content for policy violations.

    Returns:
        Dict with 'safe' bool and optional 'reason' string.
    """
    text_lower = text.lower()

    for keyword in BLOCKED_KEYWORDS:
        if keyword in text_lower:
            return {
                "safe": False,
                "reason": f"Content contains blocked keyword: '{keyword}'. "
                "This platform is for educational prediction markets only.",
            }

    # Length check
    if len(text) > 10000:
        return {
            "safe": False,
            "reason": "Content exceeds maximum length of 10,000 characters.",
        }

    return {"safe": True, "reason": None}


def moderate_market_content(title: str, description: str) -> dict:
    """Moderate market creation content."""
    title_check = check_content(title)
    if not title_check["safe"]:
        return title_check

    if description:
        desc_check = check_content(description)
        if not desc_check["safe"]:
            return desc_check

    return {"safe": True, "reason": None}
