"""
Unified AI client — Oracle OCI request-signing (Option A).

Primary provider:
  Oracle Generative AI Inference via OCI SDK + signed requests using ~/.oci/config.

Optional fallback:
  Anthropic (only when OCI is not configured).
"""

import json
import asyncio
from pathlib import Path

import oci

from app.config import settings


# ─────────────────────────────────────────────────────────────────────────────
# Request / response builders
# ─────────────────────────────────────────────────────────────────────────────

def _is_cohere(model_id: str) -> bool:
    forced = settings.ORACLE_GENAI_API_FORMAT.strip().upper()
    if forced == "COHERE":
        return True
    if forced == "GENERIC":
        return False
    return model_id.lower().startswith("cohere.")


def _build_chat_body(
    system: str,
    messages: list[dict],
    max_tokens: int,
    temperature: float,
) -> dict:
    """Build JSON body for POST /20231130/actions/chat."""
    model_id = settings.ORACLE_GENAI_MODEL

    serving_mode = {"servingType": "ON_DEMAND", "modelId": model_id}

    if _is_cohere(model_id):
        # Cohere: single "message" string + optional history + preamble
        history = []
        for m in messages[:-1]:
            role = "USER" if m.get("role", "user") == "user" else "CHATBOT"
            history.append({"role": role, "message": m.get("content", "")})

        last_msg = messages[-1].get("content", "") if messages else ""
        chat_req: dict = {
            "apiFormat": "COHERE",
            "message": last_msg,
            "maxTokens": max_tokens,
            "temperature": temperature,
            "isStream": False,
        }
        if system:
            chat_req["preambleOverride"] = system
        if history:
            chat_req["chatHistory"] = history
    else:
        # Generic / Llama: messages array + systemMessage
        oci_msgs = []
        for m in messages:
            role = "USER" if m.get("role", "user") == "user" else "ASSISTANT"
            oci_msgs.append({
                "role": role,
                "content": [{"type": "TEXT", "text": m.get("content", "")}],
            })
        chat_req = {
            "apiFormat": "GENERIC",
            "messages": oci_msgs,
            "maxTokens": max_tokens,
            "temperature": temperature,
            "isStream": False,
        }
        if system:
            chat_req["systemMessage"] = system

    body: dict = {"servingMode": serving_mode, "chatRequest": chat_req}
    if settings.ORACLE_GENAI_COMPARTMENT_ID:
        body["compartmentId"] = settings.ORACLE_GENAI_COMPARTMENT_ID
    return body


def _extract_text(response_json: dict) -> str:
    """Pull plain text from an /actions/chat response."""
    chat_resp = response_json.get("chatResponse", {})
    fmt = chat_resp.get("apiFormat", "GENERIC")
    if fmt == "COHERE":
        return chat_resp.get("text", "")
    choices = chat_resp.get("choices", [])
    if not choices:
        return ""
    content = choices[0].get("message", {}).get("content", [])
    if isinstance(content, list) and content:
        return content[0].get("text", "")
    return str(content)


# ─────────────────────────────────────────────────────────────────────────────
# Oracle GenAI — OCI signed requests
# ─────────────────────────────────────────────────────────────────────────────

def _oci_config() -> dict:
    cfg_file = str(Path(settings.OCI_CONFIG_FILE).expanduser())
    return oci.config.from_file(file_location=cfg_file, profile_name=settings.OCI_CONFIG_PROFILE)


def _oci_endpoint(cfg: dict) -> str:
    if settings.ORACLE_GENAI_BASE_URL:
        return settings.ORACLE_GENAI_BASE_URL.rstrip("/")
    region = cfg.get("region", "us-chicago-1")
    return f"https://inference.generativeai.{region}.oci.oraclecloud.com"


def _oci_post(path: str, body: dict, timeout: tuple = (10.0, 300.0)) -> dict:
    """Perform a signed POST request via OCI base client and return JSON dict.

    Args:
        timeout: (connect_timeout, read_timeout) in seconds.
                 Default read timeout is 300s (5 min) to support large LLM responses.
    """
    cfg = _oci_config()
    endpoint = _oci_endpoint(cfg)

    client = oci.generative_ai_inference.GenerativeAiInferenceClient(
        config=cfg,
        service_endpoint=endpoint,
        timeout=timeout,
    )

    response = client.base_client.call_api(
        resource_path=path,
        method="POST",
        header_params={"content-type": "application/json"},
        body=body,
        response_type="str",
    )
    text = response.data if isinstance(response.data, str) else str(response.data)
    return json.loads(text)

async def _oracle_chat(
    system: str,
    messages: list[dict],
    max_tokens: int,
    temperature: float,
) -> str:
    if not settings.ORACLE_GENAI_COMPARTMENT_ID:
        raise RuntimeError(
            "ORACLE_GENAI_COMPARTMENT_ID is required for OCI signed calls."
        )

    body = _build_chat_body(system, messages, max_tokens, temperature)
    # OCI SDK already prefixes the API version path (/20231130),
    # so resource_path must be /actions/chat (not /20231130/actions/chat).
    data = await asyncio.to_thread(_oci_post, "/actions/chat", body)
    return _extract_text(data)


async def oracle_embed(texts: list[str], model_id: str | None = None) -> list[list[float]]:
    """Embed strings using /20231130/actions/embedText.

    Args:
        texts:    Strings to embed.
        model_id: e.g. "cohere.embed-english-v3.0". Defaults to ORACLE_GENAI_MODEL.
    Returns:
        List of float vectors.
    """
    body: dict = {
        "inputs": texts,
        "servingMode": {
            "servingType": "ON_DEMAND",
            "modelId": model_id or settings.ORACLE_GENAI_MODEL,
        },
    }
    if settings.ORACLE_GENAI_COMPARTMENT_ID:
        body["compartmentId"] = settings.ORACLE_GENAI_COMPARTMENT_ID
    # OCI SDK already prefixes /20231130.
    data = await asyncio.to_thread(_oci_post, "/actions/embedText", body)
    return data.get("embeddings", [])


# ─────────────────────────────────────────────────────────────────────────────
# Anthropic — only used when ORACLE_GENAI_API_KEY is NOT set
# ─────────────────────────────────────────────────────────────────────────────

async def _anthropic_chat(system: str, messages: list[dict], max_tokens: int) -> str:
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )
        return response.content[0].text
    except Exception as e:
        raise RuntimeError(f"Anthropic error: {e}") from e


# ─────────────────────────────────────────────────────────────────────────────
# Status helpers
# ─────────────────────────────────────────────────────────────────────────────

def _oracle_configured() -> bool:
    # Option A (request signing) needs OCI config/profile + compartment + model.
    return bool(settings.OCI_CONFIG_FILE and settings.OCI_CONFIG_PROFILE and settings.ORACLE_GENAI_MODEL and settings.ORACLE_GENAI_COMPARTMENT_ID)


def _anthropic_configured() -> bool:
    return bool(settings.ANTHROPIC_API_KEY)


def ai_provider_name() -> str:
    if _oracle_configured():
        return f"Oracle GenAI OCI-Signed ({settings.ORACLE_GENAI_MODEL})"
    if _anthropic_configured():
        return f"Anthropic ({settings.ANTHROPIC_MODEL})"
    return "none"


async def ai_health_check() -> dict:
    """Live connectivity test — called by /api/health/ai."""
    provider = ai_provider_name()
    if provider == "none":
        return {
            "provider": "none",
            "status": "unconfigured",
            "message": (
                "Set OCI_CONFIG_FILE, OCI_CONFIG_PROFILE, "
                "ORACLE_GENAI_COMPARTMENT_ID and ORACLE_GENAI_MODEL in backend/.env."
            ),
        }

    try:
        reply = await chat(
            system="You are a test assistant.",
            messages=[{"role": "user", "content": "Reply with exactly: OK"}],
            max_tokens=10,
            temperature=0.0,
        )
        return {"provider": provider, "status": "ok", "test_reply": reply.strip()}
    except Exception as e:
        return {"provider": provider, "status": "error", "error": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# Public chat() — the single entry point used by all agents
# ─────────────────────────────────────────────────────────────────────────────

async def chat(
    system: str,
    messages: list[dict],
    max_tokens: int = 400,
    temperature: float = 0.7,
) -> str:
    """
    Send a chat completion request.

    Provider priority:
      1. Oracle GenAI (OCI signed) — when OCI config + compartment + model are set
      2. Anthropic     — when ANTHROPIC_API_KEY is set (and Oracle key is NOT set)
      3. Stub message  — when neither key is configured

    Oracle GenAI is ALWAYS preferred over Anthropic if its key is present.
    Anthropic is NEVER used as a silent fallback when Oracle is configured —
    if Oracle fails, the error is surfaced so you can fix it.
    """
    # ── 1. Oracle GenAI ───────────────────────────────────────────────────────
    if _oracle_configured():
        return await _oracle_chat(system, messages, max_tokens, temperature)

    # ── 2. Anthropic (only when Oracle key is absent) ─────────────────────────
    if _anthropic_configured():
        return await _anthropic_chat(system, messages, max_tokens)

    # ── 3. Stub ───────────────────────────────────────────────────────────────
    return (
        "[AI not configured] Configure OCI signing in backend/.env:\n"
        "  OCI_CONFIG_FILE=~/.oci/config\n"
        "  OCI_CONFIG_PROFILE=DEFAULT\n"
        "  ORACLE_GENAI_COMPARTMENT_ID=ocid1.compartment... (or tenancy)\n"
        "  ORACLE_GENAI_MODEL=ocid1.generativeaimodel... or model name\n"
        "Then restart backend and open /api/health/ai."
    )
