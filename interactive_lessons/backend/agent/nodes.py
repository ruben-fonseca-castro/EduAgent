from __future__ import annotations

import json
import time
import uuid
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from backend.agent.prompts import (
    GENERATE_CONTENT_SYSTEM,
    GENERATE_FIGURES_SYSTEM,
    PARSE_INPUT_SYSTEM,
    PLAN_LESSON_SYSTEM,
    REVIEW_LESSON_SYSTEM,
)
from backend.agent.state import (
    GeneratedFigure,
    LessonPlan,
    LessonPlanSchema,
    LessonSection,
    LessonState,
    ReviewResult,
)
from backend.config import get_settings


# ── parse_input ───────────────────────────────────────────────────────────────

async def parse_input(state: LessonState) -> dict:
    start = time.time()
    settings = get_settings()
    llm = settings.get_small_llm()

    raw = state["raw_input"]
    input_type = state["input_type"]

    if input_type == "pdf":
        # Already extracted; just normalize the topic
        prompt = f"Extract a concise topic name from this educational text and return it with the cleaned text.\n\nText:\n{raw[:3000]}"
    else:
        prompt = f"Parse this lesson topic: {raw}"

    response = await llm.ainvoke([
        SystemMessage(content=PARSE_INPUT_SYSTEM),
        HumanMessage(content=prompt),
    ])

    text = response.content
    try:
        # Try to parse JSON from response
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        parsed = json.loads(text)
        topic = parsed.get("topic", raw[:50])
        extracted_text = parsed.get("extracted_text", raw)
    except Exception:
        topic = raw[:50].strip()
        extracted_text = raw

    return {
        "topic": topic,
        "extracted_text": extracted_text,
        "current_node": "parse_input",
        "__took_ms__": int((time.time() - start) * 1000),
    }


# ── plan_lesson ───────────────────────────────────────────────────────────────

async def plan_lesson(state: LessonState) -> dict:
    start = time.time()
    settings = get_settings()
    llm = settings.get_llm()
    from langchain_core.output_parsers import PydanticOutputParser
    parser = PydanticOutputParser(pydantic_object=LessonPlanSchema)

    student_hint = ""
    if state.get("student_id"):
        student_hint = f"\n\nStudent ID is provided ({state['student_id']}), so set needs_rag=true to personalize."

    prompt = f"""Create a lesson plan for the following topic:

Topic: {state['topic']}
Content: {state['extracted_text'][:4000]}
{student_hint}

Generate a comprehensive lesson plan with 4-7 sections.

{parser.get_format_instructions()}"""

    response = await llm.ainvoke([
        SystemMessage(content=PLAN_LESSON_SYSTEM),
        HumanMessage(content=prompt),
    ])
    
    result: LessonPlanSchema = parser.invoke(response)

    # Extract figure requests from root, or fallback to checking inside sections if Cohere nested them
    raw_figure_requests = result.figure_requests
    if not raw_figure_requests:
        for i, sec in enumerate(result.sections):
            # Check if the parsed Pydantic object unexpectedly contains figure_requests as a dict attribute 
            # (Pydantic might drop it if strict, so we'll check the raw response if possible... wait, 
            # if we use response.content / PydanticOutputParser, Extra fields are ignored by default.
            # Let's adjust state.py to allow extra fields but for now we'll just extract from the parsed result)
            pass
            
    # Actually, if we want to catch nested figure_requests in section dicts we need to let Pydantic model them 
    # or just parse the JSON manually before Pydantic.
    import json as _json
    try:
        raw_json_str = response.content
        if "```json" in raw_json_str:
             raw_json_str = raw_json_str.split("```json")[1].split("```")[0].strip()
        parsed_raw = _json.loads(raw_json_str)
        if not raw_figure_requests and "sections" in parsed_raw:
            for i, sec_data in enumerate(parsed_raw["sections"]):
                if "figure_requests" in sec_data:
                    for fr in sec_data["figure_requests"]:
                        fr["section_index"] = i
                        raw_figure_requests.append(FigureRequest(**fr))
    except Exception:
        pass

    # Convert Pydantic model to TypedDict-compatible dict
    lesson_plan: LessonPlan = {
        "title": result.title,
        "grade_level": result.grade_level,
        "subject": result.subject,
        "learning_objectives": result.learning_objectives,
        "sections": [
            {
                "title": s.title,
                "content_type": s.content_type,
                "description": s.description,
                "generated_content": "",
                "figure_ids": [],
            }
            for s in result.sections
        ],
        "needs_rag": result.needs_rag,
        "needs_figures": result.needs_figures,
        "figure_requests": [fr.model_dump() for fr in raw_figure_requests],
        "estimated_duration_minutes": result.estimated_duration_minutes,
    }

    return {
        "lesson_plan": lesson_plan,
        "current_node": "plan_lesson",
        "__took_ms__": int((time.time() - start) * 1000),
    }


# ── retrieve_student_context ──────────────────────────────────────────────────

async def retrieve_student_context(state: LessonState) -> dict:
    start = time.time()
    student_id = state.get("student_id")
    if not student_id:
        return {"student_context": "", "student_profile": {}}

    from backend.rag.retriever import retrieve

    plan = state.get("lesson_plan", {}) or {}
    objectives = plan.get("learning_objectives", [])
    grade = plan.get("grade_level", "")
    query = f"{state['topic']} {objectives[0] if objectives else ''} {grade}".strip()

    try:
        context_chunks = retrieve(student_id, query, top_k=5)
        student_context = "\n\n".join(context_chunks)
    except Exception:
        student_context = ""

    # Load student profile
    import json as _json
    from pathlib import Path
    settings = get_settings()
    profile_path = Path(settings.student_context_dir) / student_id / "profile.json"
    student_profile = {}
    if profile_path.exists():
        with open(profile_path) as f:
            student_profile = _json.load(f)

    return {
        "student_context": student_context,
        "student_profile": student_profile,
        "current_node": "retrieve_student_context",
        "__took_ms__": int((time.time() - start) * 1000),
    }


# ── generate_content ──────────────────────────────────────────────────────────

async def generate_content(state: LessonState) -> dict:
    start = time.time()
    settings = get_settings()
    llm = settings.get_llm(streaming=True)

    plan = state["lesson_plan"]
    student_context = state.get("student_context", "")
    review_result = state.get("review_result")
    iteration = state.get("iteration_count", 0)

    # Build context for the LLM
    student_section = ""
    if student_context:
        profile = state.get("student_profile", {})
        student_section = f"""
Student Profile:
- Name: {profile.get('name', 'Unknown')}
- Grade: {profile.get('grade', plan['grade_level'])}
- Subjects: {', '.join(profile.get('subjects', []))}
- Notes: {profile.get('notes', '')}

Prior Knowledge / Context:
{student_context}

Personalize the lesson content based on this student's background.
"""

    review_section = ""
    if review_result and not review_result.passed:
        review_section = f"""
Previous Review Issues to Address:
{chr(10).join(f'- {issue}' for issue in review_result.issues)}

Please fix these issues in your content.
"""

    sections_spec = "\n".join(
        f"{i+1}. [{s['content_type'].upper()}] {s['title']}: {s['description']}"
        for i, s in enumerate(plan["sections"])
    )

    figure_ids_by_section: dict[int, list[str]] = {}
    for fr in plan.get("figure_requests", []):
        idx = fr.get("section_index", 0)
        figure_ids_by_section.setdefault(idx, []).append(f"figure_{idx}_{fr['type']}")

    prompt = f"""Generate complete HTML content for this lesson.

Lesson: {plan['title']}
Subject: {plan['subject']}
Grade Level: {plan['grade_level']}
Duration: {plan['estimated_duration_minutes']} minutes

Learning Objectives:
{chr(10).join(f'- {obj}' for obj in plan['learning_objectives'])}

Sections to generate:
{sections_spec}

{student_section}
{review_section}

For each section, output content wrapped in:
<section data-title="EXACT_SECTION_TITLE" data-type="CONTENT_TYPE">
... your HTML content ...
</section>

Generate all {len(plan['sections'])} sections with rich, educational HTML content."""

    messages = [
        SystemMessage(content=GENERATE_CONTENT_SYSTEM),
        HumanMessage(content=prompt),
    ]

    full_response = ""
    async for chunk in llm.astream(messages):
        if hasattr(chunk, "content") and chunk.content:
            full_response += chunk.content

    # Parse sections from response
    import re
    section_pattern = re.compile(
        r'<section[^>]*data-title="([^"]*)"[^>]*data-type="([^"]*)"[^>]*>(.*?)</section>',
        re.DOTALL | re.IGNORECASE
    )

    generated_sections: list[LessonSection] = []
    matches = list(section_pattern.finditer(full_response))

    if matches:
        for i, match in enumerate(matches):
            title = match.group(1)
            content_type = match.group(2)
            content = match.group(3).strip()
            fig_ids = figure_ids_by_section.get(i, [])
            generated_sections.append({
                "title": title,
                "content_type": content_type,
                "description": "",
                "generated_content": content,
                "figure_ids": fig_ids,
            })
    else:
        # Fallback: wrap all content in a single section
        generated_sections.append({
            "title": plan["title"],
            "content_type": "text",
            "description": "",
            "generated_content": full_response,
            "figure_ids": [],
        })

    from langchain_core.messages import AIMessage
    return {
        "generated_sections": generated_sections,
        "messages": [AIMessage(content=full_response)],
        "iteration_count": iteration + 1,
        "current_node": "generate_content",
        "__took_ms__": int((time.time() - start) * 1000),
    }


# ── generate_figures ──────────────────────────────────────────────────────────

async def generate_figures(state: LessonState) -> dict:
    start = time.time()
    settings = get_settings()
    llm = settings.get_llm()

    plan = state["lesson_plan"]
    figure_requests = plan.get("figure_requests", [])

    if not figure_requests:
        return {"generated_figures": [], "current_node": "generate_figures"}

    generated_figures: list[GeneratedFigure] = []

    # Try to use MCP tools; fall back to LLM-only if MCP unavailable
    try:
        from backend.mcp_servers.client import get_mcp_tools
        mcp_tools = await get_mcp_tools()
        tool_map = {t.name: t for t in mcp_tools}
    except Exception:
        tool_map = {}

    for i, fig_req in enumerate(figure_requests):
        fig_type = fig_req.get("type", "mathjax")
        description = fig_req.get("description", "")
        section_index = fig_req.get("section_index", 0)
        figure_id = str(uuid.uuid4())[:8]

        try:
            if fig_type == "plotly":
                code = await _generate_plotly_code(llm, description, plan)
                if "execute_plotly_code" in tool_map:
                    result_str = await tool_map["execute_plotly_code"].ainvoke({"code": code})
                    result = json.loads(result_str) if isinstance(result_str, str) else result_str
                    if result.get("success"):
                        generated_figures.append({
                            "figure_id": figure_id,
                            "figure_type": "plotly",
                            "title": description[:60],
                            "data": result["figure_json"],
                            "section_index": section_index,
                        })
                        continue
                # Fallback: store code as-is
                generated_figures.append({
                    "figure_id": figure_id,
                    "figure_type": "plotly",
                    "title": description[:60],
                    "data": _plotly_fallback(description),
                    "section_index": section_index,
                })

            elif fig_type == "mermaid":
                syntax = await _generate_mermaid_syntax(llm, description, plan)
                generated_figures.append({
                    "figure_id": figure_id,
                    "figure_type": "mermaid",
                    "title": description[:60],
                    "data": syntax,
                    "section_index": section_index,
                })

            elif fig_type == "mathjax":
                latex = await _generate_latex(llm, description, plan)
                generated_figures.append({
                    "figure_id": figure_id,
                    "figure_type": "mathjax",
                    "title": description[:60],
                    "data": latex,
                    "section_index": section_index,
                })

        except Exception as e:
            # Don't fail the whole pipeline for a figure error
            generated_figures.append({
                "figure_id": figure_id,
                "figure_type": fig_type,
                "title": f"Figure: {description[:40]}",
                "data": f"<!-- Figure generation failed: {e} -->",
                "section_index": section_index,
            })

    return {
        "generated_figures": generated_figures,
        "current_node": "generate_figures",
        "__took_ms__": int((time.time() - start) * 1000),
    }


async def _generate_plotly_code(llm, description: str, plan: dict) -> str:
    response = await llm.ainvoke([
        SystemMessage(content=GENERATE_FIGURES_SYSTEM),
        HumanMessage(content=f"""Write Python code to create an interactive Plotly figure for:
"{description}"

Context: {plan['subject']} lesson for {plan['grade_level']} students.

Requirements:
- Import plotly.graph_objects as go
- Assign the figure to variable 'fig'
- Make it educational and visually clear
- Add title, axis labels, and annotations

Return ONLY the Python code, no explanations."""),
    ])
    code = response.content.strip()
    if "```python" in code:
        code = code.split("```python")[1].split("```")[0].strip()
    elif "```" in code:
        code = code.split("```")[1].split("```")[0].strip()
    return code


async def _generate_mermaid_syntax(llm, description: str, plan: dict) -> str:
    response = await llm.ainvoke([
        SystemMessage(content=GENERATE_FIGURES_SYSTEM),
        HumanMessage(content=f"""Create a Mermaid diagram for:
"{description}"

Context: {plan['subject']} lesson for {plan['grade_level']} students.

Return ONLY valid Mermaid syntax, no explanations or code blocks."""),
    ])
    syntax = response.content.strip()
    if "```mermaid" in syntax:
        syntax = syntax.split("```mermaid")[1].split("```")[0].strip()
    elif "```" in syntax:
        syntax = syntax.split("```")[1].split("```")[0].strip()
    return syntax


async def _generate_latex(llm, description: str, plan: dict) -> str:
    response = await llm.ainvoke([
        SystemMessage(content=GENERATE_FIGURES_SYSTEM),
        HumanMessage(content=f"""Write a LaTeX equation for:
"{description}"

Context: {plan['subject']} lesson for {plan['grade_level']} students.

Return ONLY the LaTeX string (without $$ delimiters), no explanations."""),
    ])
    latex = response.content.strip()
    if "$$" in latex:
        latex = latex.replace("$$", "").strip()
    if "$" in latex:
        latex = latex.replace("$", "").strip()
    return latex


def _plotly_fallback(description: str) -> str:
    """Minimal fallback plotly figure JSON."""
    import json
    return json.dumps({
        "data": [{"type": "scatter", "x": [1, 2, 3], "y": [1, 2, 3], "mode": "lines+markers"}],
        "layout": {"title": description[:60]},
    })


# ── assemble_html ─────────────────────────────────────────────────────────────

async def assemble_html(state: LessonState) -> dict:
    start = time.time()
    from backend.utils.html_builder import build_and_save_lesson

    html_path = await build_and_save_lesson(state)

    return {
        "final_html": str(html_path),
        "completed": True,
        "current_node": "assemble_html",
        "__took_ms__": int((time.time() - start) * 1000),
    }


# ── review_lesson ─────────────────────────────────────────────────────────────

async def review_lesson(state: LessonState) -> dict:
    start = time.time()
    settings = get_settings()
    llm = settings.get_llm()
    structured_llm = llm.with_structured_output(ReviewResult)

    plan = state.get("lesson_plan", {}) or {}
    sections = state.get("generated_sections", [])
    iteration = state.get("iteration_count", 0)

    sections_summary = "\n".join(
        f"Section {i+1}: {s['title']} ({len(s['generated_content'])} chars)"
        for i, s in enumerate(sections)
    )

    prompt = f"""Review this generated lesson:

Title: {plan.get('title', 'Unknown')}
Subject: {plan.get('subject', 'Unknown')}
Grade: {plan.get('grade_level', 'Unknown')}
Iteration: {iteration}

Planned sections: {len(plan.get('sections', []))}
Generated sections: {len(sections)}

Sections summary:
{sections_summary}

Sample content from first section:
{sections[0]['generated_content'][:500] if sections else 'No content'}

Evaluate the lesson quality and determine if it should be published."""

    result: ReviewResult = await structured_llm.ainvoke([
        SystemMessage(content=REVIEW_LESSON_SYSTEM),
        HumanMessage(content=prompt),
    ])

    return {
        "review_result": result,
        "current_node": "review_lesson",
        "__took_ms__": int((time.time() - start) * 1000),
    }
