"""
MCP Server: Educational Figure Generator
Runs as a stdio subprocess via MultiServerMCPClient.

Tools:
  - execute_plotly_code: Run Python code that creates a Plotly figure
  - execute_mermaid: Validate and return Mermaid diagram syntax
  - generate_mathjax_equation: Wrap LaTeX in HTML snippet
"""
from __future__ import annotations

import json
import sys
import traceback
from typing import Any

# FastMCP for clean tool definition
try:
    from mcp.server.fastmcp import FastMCP
except ImportError:
    # Fallback import path
    from fastmcp import FastMCP

mcp = FastMCP("EduAgent Figure Tools")

# ── Allowed globals for exec() sandbox ────────────────────────────────────────
_SAFE_BUILTINS = {
    "range": range, "len": len, "list": list, "dict": dict, "tuple": tuple,
    "set": set, "enumerate": enumerate, "zip": zip, "map": map, "filter": filter,
    "min": min, "max": max, "sum": sum, "abs": abs, "round": round,
    "int": int, "float": float, "str": str, "bool": bool,
    "print": print, "isinstance": isinstance, "hasattr": hasattr,
}

_MERMAID_KEYWORDS = [
    "flowchart", "graph", "sequenceDiagram", "classDiagram", "stateDiagram",
    "erDiagram", "gantt", "pie", "gitGraph", "mindmap", "timeline", "xychart-beta",
]


@mcp.tool()
def execute_plotly_code(code: str) -> str:
    """
    Execute Python code that creates a Plotly figure assigned to variable 'fig'.

    Returns JSON: {"success": true, "figure_json": "..."} or {"success": false, "error": "..."}
    """
    try:
        import numpy as np
        import plotly.graph_objects as go
        import plotly.io as pio

        namespace: dict[str, Any] = {
            "go": go,
            "json": json,
            "np": np,
            "__builtins__": _SAFE_BUILTINS,
        }

        exec(code, namespace)  # noqa: S102

        fig = namespace.get("fig")
        if fig is None:
            return json.dumps({"success": False, "error": "Code did not assign a 'fig' variable"})

        if not isinstance(fig, go.Figure):
            return json.dumps({"success": False, "error": f"'fig' is not a plotly Figure, got {type(fig).__name__}"})

        figure_json = pio.to_json(fig)
        return json.dumps({"success": True, "figure_json": figure_json})

    except Exception as e:
        return json.dumps({"success": False, "error": str(e), "traceback": traceback.format_exc()})


@mcp.tool()
def execute_mermaid(mermaid_syntax: str) -> str:
    """
    Validate Mermaid diagram syntax.

    Returns JSON: {"success": true, "mermaid_syntax": "..."} or {"success": false, "error": "..."}
    """
    cleaned = mermaid_syntax.strip()

    # Check if starts with a known Mermaid diagram keyword
    first_line = cleaned.split("\n")[0].strip().lower()
    is_valid = any(first_line.startswith(kw.lower()) for kw in _MERMAID_KEYWORDS)

    if not is_valid:
        return json.dumps({
            "success": False,
            "error": f"Mermaid syntax must start with a diagram type keyword. Got: '{first_line}'. "
                     f"Valid keywords: {', '.join(_MERMAID_KEYWORDS)}",
        })

    return json.dumps({"success": True, "mermaid_syntax": cleaned})


@mcp.tool()
def generate_mathjax_equation(latex: str, display_mode: bool = True) -> str:
    """
    Wrap LaTeX in MathJax-compatible HTML snippet.

    Returns JSON: {"success": true, "html_snippet": "..."}
    """
    clean_latex = latex.strip()
    # Remove any existing delimiters
    for delim in ["$$", "$"]:
        clean_latex = clean_latex.replace(delim, "")
    clean_latex = clean_latex.strip()

    if display_mode:
        html_snippet = f'<div class="mathjax-equation">$${clean_latex}$$</div>'
    else:
        html_snippet = f'<span class="mathjax-inline">${clean_latex}$</span>'

    return json.dumps({"success": True, "html_snippet": html_snippet, "latex": clean_latex})


if __name__ == "__main__":
    mcp.run(transport="stdio")
