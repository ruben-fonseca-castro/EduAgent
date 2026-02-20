from __future__ import annotations

import sys
from pathlib import Path

from backend.config import get_settings


async def get_mcp_tools() -> list:
    """
    Initialize MultiServerMCPClient and return LangChain-compatible tools.

    IMPORTANT: The MCP client context must wrap the entire agent execution.
    This function returns tools bound to a live session — do not close the
    context until all tool calls are complete.
    """
    try:
        from langchain_mcp_adapters.client import MultiServerMCPClient
    except ImportError:
        return []

    settings = get_settings()
    server_path = Path(settings.mcp_server_path).resolve()

    if not server_path.exists():
        return []

    client = MultiServerMCPClient({
        "code_executor": {
            "command": sys.executable,
            "args": [str(server_path)],
            "transport": "stdio",
        }
    })

    # Note: caller is responsible for managing context lifecycle
    # For hackathon/demo use, we initialize per-request (acceptable for low concurrency)
    try:
        async with client as c:
            tools = c.get_tools()
            return tools
    except Exception:
        return []


async def get_mcp_client_context(settings=None):
    """
    Returns the async context manager for MultiServerMCPClient.
    Use as: async with get_mcp_client_context() as tools: ...
    """
    from langchain_mcp_adapters.client import MultiServerMCPClient

    if settings is None:
        settings = get_settings()

    server_path = Path(settings.mcp_server_path).resolve()

    return MultiServerMCPClient({
        "code_executor": {
            "command": sys.executable,
            "args": [str(server_path)],
            "transport": "stdio",
        }
    })
