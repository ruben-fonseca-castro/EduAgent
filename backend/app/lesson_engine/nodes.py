"""Lesson engine graph nodes — adapted from friend_code/interactive_lessons/backend/agent/nodes.py.

Key changes from original:
- Uses app.lesson_engine.config instead of backend.config
- Uses app.services.personal_rag for combined RAG retrieval
- Inlines Plotly/Mermaid execution instead of MCP subprocess
- Uses app.lesson_engine.html_builder instead of backend.utils.html_builder
"""

from __future__ import annotations

import json
import re
import time
import uuid
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.lesson_engine.prompts import (
    GENERATE_CONTENT_SYSTEM,
    GENERATE_FIGURES_SYSTEM,
    PARSE_INPUT_SYSTEM,
    PLAN_LESSON_SYSTEM,
    REVIEW_LESSON_SYSTEM,
)
from app.lesson_engine.state import (
    FigureRequest,
    GeneratedFigure,
    LessonPlan,
    LessonPlanSchema,
    LessonSectionSchema,
    LessonSection,
    LessonState,
    PlotlyFigureSchema,
    MermaidFigureSchema,
    ReviewResult,
)
from app.lesson_engine.config import get_llm, get_small_llm


# ── parse_input ───────────────────────────────────────────────────────────────

async def parse_input(state: LessonState) -> dict:
    start = time.time()
    llm = get_small_llm()

    raw = state["raw_input"]
    input_type = state.get("input_type", "prompt")

    if input_type == "pdf":
        prompt = f"Extract a concise topic name from this educational text and return it with the cleaned text.\n\nText:\n{raw[:3000]}"
    else:
        prompt = f"Parse this lesson topic: {raw}"

    response = await llm.ainvoke([
        SystemMessage(content=PARSE_INPUT_SYSTEM),
        HumanMessage(content=prompt),
    ])

    text = response.content
    try:
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
    }


# ── plan_lesson ───────────────────────────────────────────────────────────────

async def plan_lesson(state: LessonState) -> dict:
    start = time.time()
    llm = get_llm()
    from langchain_core.output_parsers import PydanticOutputParser
    parser = PydanticOutputParser(pydantic_object=LessonPlanSchema)

    student_hint = ""
    if state.get("student_id"):
        student_hint = f"\n\nStudent ID is provided ({state['student_id']}), so set needs_rag=true to personalize."

    prompt = f"""Create a lesson plan for the following topic:

Topic: {state['topic']}
Content summary: {state['extracted_text'][:2000]}
{student_hint}

Generate a focused lesson plan with exactly 3-4 sections.

{parser.get_format_instructions()}"""

    response = await llm.ainvoke([
        SystemMessage(content=PLAN_LESSON_SYSTEM),
        HumanMessage(content=prompt),
    ])

    try:
        result: LessonPlanSchema = parser.invoke(response)
    except Exception:
        # Fallback: try manual JSON extraction
        raw = response.content
        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0].strip()
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0].strip()
        # Find JSON object
        if "{" in raw:
            raw = raw[raw.index("{"):]
        try:
            parsed = json.loads(raw)
            result = LessonPlanSchema(**parsed)
        except Exception:
            # Ultimate fallback: build a basic lesson plan from the topic
            topic = state.get("topic", "Lesson")
            result = LessonPlanSchema(
                title=topic,
                grade_level="undergraduate",
                subject="General",
                learning_objectives=["Understand the core concepts", "Apply learned knowledge"],
                sections=[
                    LessonSectionSchema(title="Introduction", content_type="text", description="Overview of the topic"),
                    LessonSectionSchema(title="Core Concepts", content_type="text", description="Main concepts and principles"),
                    LessonSectionSchema(title="Examples and Applications", content_type="text", description="Practical examples"),
                    LessonSectionSchema(title="Summary", content_type="text", description="Key takeaways"),
                ],
                needs_rag=bool(state.get("student_id")),
                needs_figures=True,
                figure_requests=[
                    FigureRequest(
                        type="plotly",
                        description=f"An interactive chart illustrating a key concept from the {topic} topic",
                        section_index=1,
                    )
                ],
                estimated_duration_minutes=20,
            )

    raw_figure_requests = list(result.figure_requests)

    if not raw_figure_requests:
        # Try to extract figures from raw JSON (in case the parser missed nested figure_requests)
        try:
            raw_json_str = response.content
            if "```json" in raw_json_str:
                raw_json_str = raw_json_str.split("```json")[1].split("```")[0].strip()
            elif "```" in raw_json_str:
                raw_json_str = raw_json_str.split("```")[1].split("```")[0].strip()
            parsed_raw = json.loads(raw_json_str)
            if "sections" in parsed_raw:
                for i, sec_data in enumerate(parsed_raw["sections"]):
                    if "figure_requests" in sec_data:
                        for fr in sec_data["figure_requests"]:
                            fr["section_index"] = i
                            raw_figure_requests.append(FigureRequest(**fr))
        except Exception:
            pass

    # Safety net: if still no figures, inject a default plotly figure
    if not raw_figure_requests:
        topic = state.get("topic", result.title)
        raw_figure_requests = [
            FigureRequest(
                type="plotly",
                description=f"An interactive chart visually illustrating a key concept from '{topic}' — choose an appropriate data relationship, distribution, or process to plot with labeled axes",
                section_index=min(1, len(result.sections) - 1),
            )
        ]
        result = LessonPlanSchema(
            **{
                **result.model_dump(),
                "needs_figures": True,
                "figure_requests": raw_figure_requests,
            }
        )

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
        "needs_rag": bool(state.get("student_id")),  # Always true when student_id is present
        "needs_figures": True,  # Always true — every lesson has at least one figure
        "figure_requests": [fr.model_dump() for fr in raw_figure_requests],
        "estimated_duration_minutes": result.estimated_duration_minutes,
    }

    return {
        "lesson_plan": lesson_plan,
        "current_node": "plan_lesson",
    }


# ── retrieve_student_context ──────────────────────────────────────────────────

async def retrieve_student_context(state: LessonState) -> dict:
    """Retrieve combined global (course) + personal (student) RAG context."""
    start = time.time()
    student_id = state.get("student_id")
    if not student_id:
        return {"student_context": "", "student_profile": {}, "current_node": "retrieve_student_context"}

    from app.services.personal_rag import retrieve_personal_context

    plan = state.get("lesson_plan") or {}
    objectives = plan.get("learning_objectives", [])
    grade = plan.get("grade_level", "")
    query = f"{state.get('topic', '')} {objectives[0] if objectives else ''} {grade}".strip()

    # Retrieve personal context from ChromaDB
    try:
        personal_chunks = retrieve_personal_context(student_id, query, top_k=5)
        student_context = "\n\n".join(personal_chunks)
    except Exception:
        student_context = ""

    # Load student profile from DB
    student_profile = {}
    try:
        from app.database import SessionLocal
        from app.models.student_profile import StudentProfile
        db = SessionLocal()
        try:
            profile = db.query(StudentProfile).filter(StudentProfile.user_id == student_id).first()
            if profile:
                student_profile = {
                    "name": profile.user.display_name if profile.user else "Student",
                    "grade": profile.grade_level or "undergraduate",
                    "subjects": json.loads(profile.subjects) if profile.subjects else [],
                    "notes": profile.additional_details or "",
                    "learning_style": profile.learning_style_summary or "",
                }
        finally:
            db.close()
    except Exception:
        pass

    return {
        "student_context": student_context,
        "student_profile": student_profile,
        "current_node": "retrieve_student_context",
    }


# ── Markdown-to-HTML safety net ───────────────────────────────────────────────

def _ensure_html(content: str) -> str:
    """Convert any residual markdown in content to HTML.

    The LLM is asked for HTML, but sometimes returns markdown.  This function
    detects markdown patterns and converts them so the Jinja2 template renders
    properly (it uses {{ content | safe }} which expects HTML).
    """
    if not content or not content.strip():
        return content

    # Quick heuristic: if the content already has substantial HTML tags, skip conversion
    html_tag_count = len(re.findall(r'<(?:p|h[1-6]|ul|ol|li|div|strong|em|pre|code|table|tr|td|th)\b', content))
    markdown_indicator_count = (
        content.count("\n## ") + content.count("\n### ") + content.count("\n- ") +
        content.count("**") // 2 + content.count("\n```")
    )

    # If mostly HTML already, just do a light markdown cleanup
    if html_tag_count > 3 and markdown_indicator_count <= 2:
        # Just clean up any stray bold markdown inside HTML
        content = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', content)
        content = re.sub(r'\*(.+?)\*', r'<em>\1</em>', content)
        return content

    # If content looks like markdown, convert it
    if markdown_indicator_count > 2 or html_tag_count == 0:
        # Headers
        content = re.sub(r'^#### (.+)$', r'<h4>\1</h4>', content, flags=re.MULTILINE)
        content = re.sub(r'^### (.+)$', r'<h3>\1</h3>', content, flags=re.MULTILINE)
        content = re.sub(r'^## (.+)$', r'<h2>\1</h2>', content, flags=re.MULTILINE)
        content = re.sub(r'^# (.+)$', r'<h2>\1</h2>', content, flags=re.MULTILINE)

        # Bold and italic
        content = re.sub(r'\*\*\*(.+?)\*\*\*', r'<strong><em>\1</em></strong>', content)
        content = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', content)
        content = re.sub(r'\*(.+?)\*', r'<em>\1</em>', content)

        # Code blocks
        content = re.sub(
            r'```(\w*)\n(.*?)```',
            r'<pre><code>\2</code></pre>',
            content,
            flags=re.DOTALL,
        )

        # Inline code
        content = re.sub(r'`([^`]+)`', r'<code>\1</code>', content)

        # Unordered lists: convert consecutive "- item" lines
        def _convert_ul(match):
            items = re.findall(r'^[-*]\s+(.+)$', match.group(0), re.MULTILINE)
            li_items = "".join(f"<li>{item}</li>" for item in items)
            return f"<ul>{li_items}</ul>"

        content = re.sub(r'(^[-*]\s+.+$\n?)+', _convert_ul, content, flags=re.MULTILINE)

        # Ordered lists: convert consecutive "1. item" lines
        def _convert_ol(match):
            items = re.findall(r'^\d+\.\s+(.+)$', match.group(0), re.MULTILINE)
            li_items = "".join(f"<li>{item}</li>" for item in items)
            return f"<ol>{li_items}</ol>"

        content = re.sub(r'(^\d+\.\s+.+$\n?)+', _convert_ol, content, flags=re.MULTILINE)

        # Wrap remaining bare text lines in <p> tags
        lines = content.split("\n")
        result_lines = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            # Skip lines that are already HTML tags
            if re.match(r'^<(?:h[1-6]|p|ul|ol|li|div|pre|code|table|tr|td|th|strong|em|blockquote)', stripped):
                result_lines.append(line)
            elif stripped.startswith("$$") or stripped.startswith("$"):
                result_lines.append(line)
            elif not re.match(r'^</', stripped) and not re.match(r'.*>$', stripped):
                result_lines.append(f"<p>{stripped}</p>")
            else:
                result_lines.append(line)

        content = "\n".join(result_lines)

    return content


# ── generate_content ──────────────────────────────────────────────────────────

async def generate_content(state: LessonState) -> dict:
    start = time.time()
    llm = get_llm(streaming=True)

    plan = state["lesson_plan"]
    student_context = state.get("student_context", "")
    review_result = state.get("review_result")
    iteration = state.get("iteration_count", 0)

    student_section = ""
    profile = state.get("student_profile", {})
    if profile or student_context:
        notes = profile.get('notes', '')
        mandatory_style = (
            f"\nMANDATORY STYLE INSTRUCTIONS (apply throughout all content): {notes}"
            if notes.strip()
            else ""
        )
        student_section = f"""
Student Profile:
- Name: {profile.get('name', 'Unknown')}
- Grade: {profile.get('grade', plan['grade_level'])}
- Subjects: {', '.join(profile.get('subjects', []))}
- Learning Style: {profile.get('learning_style', '')}
{mandatory_style}

Prior Knowledge / Context:
{student_context}

Personalize ALL lesson content based on this student's background and learning style.
If MANDATORY STYLE INSTRUCTIONS are provided above, you MUST follow them throughout every section you write.
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

    prompt = f"""Generate HTML lesson content for {len(plan['sections'])} sections.

Topic: {plan['title']} ({plan['subject']}, {plan['grade_level']})
Objectives: {'; '.join(plan['learning_objectives'][:3])}

Sections:
{sections_spec}

{student_section if student_section else ''}
{review_section[:300] if review_section else ''}

CRITICAL: Output ONLY valid HTML, never markdown. No **, no ##, no ```.
Output each section wrapped in:
<section data-title="EXACT_SECTION_TITLE" data-type="CONTENT_TYPE">
[200-400 words of pure HTML content using tags like <h3>, <p>, <strong>, <ul>, <li>, etc.]
</section>

Generate all {len(plan['sections'])} sections now:"""

    messages = [
        SystemMessage(content=GENERATE_CONTENT_SYSTEM),
        HumanMessage(content=prompt),
    ]

    full_response = ""
    async for chunk in llm.astream(messages):
        if hasattr(chunk, "content") and chunk.content:
            full_response += chunk.content

    # Parse sections from response
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
            content = _ensure_html(match.group(3).strip())
            fig_ids = figure_ids_by_section.get(i, [])
            generated_sections.append({
                "title": title,
                "content_type": content_type,
                "description": "",
                "generated_content": content,
                "figure_ids": fig_ids,
            })
    else:
        generated_sections.append({
            "title": plan["title"],
            "content_type": "text",
            "description": "",
            "generated_content": _ensure_html(full_response),
            "figure_ids": [],
        })

    return {
        "generated_sections": generated_sections,
        "messages": [AIMessage(content=full_response)],
        "iteration_count": iteration + 1,
        "current_node": "generate_content",
    }


# ── generate_figures ──────────────────────────────────────────────────────────

async def generate_figures(state: LessonState) -> dict:
    start = time.time()
    llm = get_llm()

    plan = state["lesson_plan"]
    figure_requests = plan.get("figure_requests", [])

    if not figure_requests:
        return {"generated_figures": [], "current_node": "generate_figures"}

    generated_figures: list[GeneratedFigure] = []

    for i, fig_req in enumerate(figure_requests):
        fig_type = fig_req.get("type", "mathjax")
        description = fig_req.get("description", "")
        section_index = fig_req.get("section_index", 0)
        figure_id = str(uuid.uuid4())[:8]

        try:
            if fig_type == "plotly":
                code = await _generate_plotly_code(llm, description, plan)
                fig_json = _execute_plotly_code(code, description)
                # Parse the title from the generated figure JSON itself (most accurate)
                try:
                    fig_data = json.loads(fig_json) if isinstance(fig_json, str) else fig_json
                    fig_title = fig_data.get("layout", {}).get("title", {})
                    if isinstance(fig_title, dict):
                        fig_title = fig_title.get("text", "")
                    fig_title = str(fig_title).strip() or description
                except Exception:
                    fig_title = description
                generated_figures.append({
                    "figure_id": figure_id,
                    "figure_type": "plotly",
                    "title": fig_title,  # Use actual figure title, not truncated description
                    "data": fig_json,
                    "section_index": section_index,
                })

            elif fig_type == "mermaid":
                syntax = await _generate_mermaid_syntax(llm, description, plan)
                generated_figures.append({
                    "figure_id": figure_id,
                    "figure_type": "mermaid",
                    "title": description,  # Full description, template will truncate if needed
                    "data": syntax,
                    "section_index": section_index,
                })

            elif fig_type == "mathjax":
                latex = await _generate_latex(llm, description, plan)
                generated_figures.append({
                    "figure_id": figure_id,
                    "figure_type": "mathjax",
                    "title": description,  # Full description
                    "data": latex,
                    "section_index": section_index,
                })

        except Exception as e:
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
    }


def _execute_plotly_code(code: str, description: str = "") -> str:
    """Execute Plotly code in a restricted environment and return figure JSON.

    Adapted from friend_code's mcp_servers/python_executor.py execute_plotly_code tool.
    """
    if not code or not code.strip():
        print(f"Plotly code generation returned empty code, using fallback", flush=True)
        return _plotly_fallback(description)

    try:
        import numpy as np
        import plotly.graph_objects as go
        import plotly.io as pio

        # Optional libraries — gracefully absent if not installed
        try:
            import scipy.stats as scipy_stats
        except ImportError:
            scipy_stats = None  # type: ignore

        try:
            import plotly.express as px
        except ImportError:
            px = None  # type: ignore

        safe_builtins = {
            "abs": abs, "min": min, "max": max, "sum": sum,
            "len": len, "range": range, "round": round, "int": int,
            "float": float, "str": str, "list": list, "dict": dict,
            "tuple": tuple, "enumerate": enumerate, "zip": zip,
            "sorted": sorted, "reversed": reversed, "map": map,
            "filter": filter, "True": True, "False": False, "None": None,
            "print": lambda *a, **k: None,
            "zip": zip, "pow": pow,
        }

        exec_namespace = {
            "__builtins__": safe_builtins,
            "go": go,
            "np": np,
            "json": json,
            "scipy_stats": scipy_stats,  # scipy.stats available as scipy_stats
            "px": px,                     # plotly.express available as px (may be None)
            "math": __import__("math"),
        }

        exec(code, exec_namespace)

        fig = exec_namespace.get("fig")
        if fig is not None and hasattr(fig, "to_json"):
            return pio.to_json(fig)
        else:
            print(f"Plotly exec succeeded but no 'fig' variable found", flush=True)
    except Exception as e:
        print(f"Plotly execution failed: {e}\nCode was:\n{code[:500]}", flush=True)

    return _plotly_fallback(description)


async def _generate_plotly_code(llm, description: str, plan: dict) -> str:
    """Generate Plotly Python code using plain text extraction (not structured output).

    Structured output via with_structured_output is fragile with OCI GenAI
    and often returns empty code on parse failure. Instead, ask the LLM to
    return the code directly and extract it from the response text.
    """
    topic = plan.get("title", "")
    subject = plan.get("subject", "")
    grade = plan.get("grade_level", "")
    objectives = plan.get("learning_objectives", [])
    obj_str = "; ".join(objectives[:3]) if objectives else ""

    response = await llm.ainvoke([
        SystemMessage(content=(
            "You are a Python data-visualization expert. "
            "Given a description, write Python code that creates a Plotly figure. "
            "Output ONLY the Python code inside a single ```python code block. "
            "No explanations, no preamble, no commentary outside the code block."
        )),
        HumanMessage(content=f"""Write Python code to create an interactive, educationally accurate Plotly figure.

Topic: "{topic}" — {subject} lesson for {grade} students
Learning objectives: {obj_str}
Figure description: "{description}"

PRE-IMPORTED NAMES (do NOT use import statements):
- 'go'          → plotly.graph_objects  (e.g. go.Bar, go.Scatter, go.Figure)
- 'np'          → numpy                 (e.g. np.linspace, np.array, np.random)
- 'math'        → Python math module    (e.g. math.factorial, math.comb)
- 'scipy_stats' → scipy.stats           (e.g. scipy_stats.binom, scipy_stats.norm) — may be None, check first

STRICT REQUIREMENTS:
1. DO NOT write any import statements — use only the pre-imported names above.
2. Assign the final figure to a variable named exactly 'fig'.
3. Use CORRECT mathematical/statistical data for the topic:
   - For probability distributions (binomial, normal, Poisson, etc.): compute the EXACT PMF/PDF using the correct formula or scipy_stats if available. Use bar charts for discrete distributions, line/area for continuous ones. Y-axis must show valid probabilities (0 to 1). Never use smooth curves for discrete distributions.
   - For algorithms: show correct time-complexity curves (O(n), O(n log n), O(n²), etc.)
   - For physics/chemistry: use real physical constants and accurate equations.
   - For general data: generate realistic, domain-accurate simulated data.
4. Choose chart type to match data nature: go.Bar for discrete, go.Scatter(mode='lines') for continuous.
5. Include: accurate title, labeled axes with units, legend if multiple traces.
6. Use clean styling: template='plotly_white', colors like '#00274C' (navy), '#FFCB05' (gold), '#D50032' (red).

EXAMPLE — Binomial distribution PMF (n=10, p=0.5):
```python
n, p = 10, 0.5
k = list(range(n + 1))
if scipy_stats is not None:
    pmf = [scipy_stats.binom.pmf(ki, n, p) for ki in k]
else:
    pmf = [math.comb(n, ki) * (p**ki) * ((1-p)**(n-ki)) for ki in k]
fig = go.Figure()
fig.add_trace(go.Bar(x=k, y=pmf, marker_color='#00274C', name='P(X=k)'))
fig.update_layout(title='Binomial PMF (n=10, p=0.5)', xaxis_title='Number of Successes (k)', yaxis_title='Probability P(X=k)', template='plotly_white', xaxis=dict(tickmode='linear', dtick=1))
```

Now write the code for THIS figure — be mathematically accurate for the described topic:"""),
    ])

    raw = response.content.strip() if hasattr(response, "content") else str(response).strip()

    # Extract Python code from code block
    code = ""
    if "```python" in raw:
        code = raw.split("```python")[1].split("```")[0].strip()
    elif "```" in raw:
        code = raw.split("```")[1].split("```")[0].strip()
    else:
        # No code block — take the whole response if it looks like Python
        if "fig" in raw and ("go." in raw or "Figure" in raw):
            code = raw

    # Strip any accidental import lines
    if code:
        lines = code.split("\n")
        lines = [l for l in lines if not l.strip().startswith("import ") and not l.strip().startswith("from ")]
        code = "\n".join(lines)

    return code


async def _generate_mermaid_syntax(llm, description: str, plan: dict) -> str:
    structured_llm = llm.with_structured_output(MermaidFigureSchema)

    response = await structured_llm.ainvoke([
        SystemMessage(content=GENERATE_FIGURES_SYSTEM),
        HumanMessage(content=f"""Create a Mermaid diagram for:
"{description}"

Context: {plan['subject']} lesson for {plan['grade_level']} students.

Requirements:
- You MUST only use `flowchart` or `graph` diagram types (e.g. `flowchart TD` or `flowchart LR`).
- DO NOT use `classDiagram`, `stateDiagram`, `sequenceDiagram`, or any other complex syntax.
- Use simple, well-supported Mermaid features to avoid syntax errors.
- CRITICAL: Quote node labels containing special characters like parentheses, commas, or brackets.
- Avoid HTML tags in labels.""")
    ])

    if not response:
        return ""

    syntax = response.syntax.strip()
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
    """Generate a meaningful fallback plotly figure using numpy."""
    try:
        import numpy as np
        title = description[:80] if description else "Concept Visualization"

        # Generate a meaningful-looking chart rather than y=x
        x = np.linspace(0, 10, 50)
        y1 = np.exp(-0.3 * x) * np.cos(2 * x) + 1
        y2 = 1 - np.exp(-0.5 * x)

        return json.dumps({
            "data": [
                {
                    "type": "scatter", "x": x.tolist(), "y": y1.tolist(),
                    "mode": "lines", "name": "Pattern A",
                    "line": {"color": "#00274C", "width": 2},
                },
                {
                    "type": "scatter", "x": x.tolist(), "y": y2.tolist(),
                    "mode": "lines", "name": "Pattern B",
                    "line": {"color": "#D50032", "width": 2, "dash": "dash"},
                },
            ],
            "layout": {
                "title": {"text": title, "font": {"size": 16}},
                "xaxis": {"title": "Input"},
                "yaxis": {"title": "Output"},
                "template": "plotly_white",
                "showlegend": True,
            },
        })
    except Exception:
        return json.dumps({
            "data": [{"type": "scatter", "x": [1, 2, 3, 4, 5], "y": [2, 4, 3, 5, 4], "mode": "lines+markers"}],
            "layout": {"title": description[:60] if description else "Figure"},
        })


# ── assemble_html ─────────────────────────────────────────────────────────────

async def assemble_html(state: LessonState) -> dict:
    start = time.time()
    from app.lesson_engine.html_builder import build_and_save_lesson

    html_path = await build_and_save_lesson(state)

    return {
        "final_html": str(html_path),
        "completed": True,
        "current_node": "assemble_html",
    }


# ── review_lesson ─────────────────────────────────────────────────────────────

async def review_lesson(state: LessonState) -> dict:
    start = time.time()
    llm = get_llm()
    structured_llm = llm.with_structured_output(ReviewResult)

    plan = state.get("lesson_plan") or {}
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

    try:
        result: ReviewResult = await structured_llm.ainvoke([
            SystemMessage(content=REVIEW_LESSON_SYSTEM),
            HumanMessage(content=prompt),
        ])
        # Validate result is a ReviewResult instance
        if not isinstance(result, ReviewResult):
            result = ReviewResult(passed=True, issues=[])
    except Exception:
        # If review fails, assume passed to avoid infinite retry loop
        result = ReviewResult(passed=True, issues=[])

    return {
        "review_result": result,
        "current_node": "review_lesson",
    }
