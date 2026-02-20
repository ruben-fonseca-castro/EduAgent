from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import aiofiles
import json as _json

from jinja2 import Environment, FileSystemLoader

from backend.config import get_settings


def _get_jinja_env() -> Environment:
    templates_dir = Path(__file__).parent.parent.parent / "templates"
    env = Environment(loader=FileSystemLoader(str(templates_dir)), autoescape=False)
    # Add tojson filter (Jinja2 has it built-in since 2.9, but ensure it's available)
    if "tojson" not in env.filters:
        env.filters["tojson"] = lambda v, **kw: _json.dumps(v, **kw)
    return env


async def build_and_save_lesson(state: dict) -> Path:
    settings = get_settings()
    lessons_dir = Path(settings.lessons_dir)
    lessons_dir.mkdir(parents=True, exist_ok=True)

    lesson_id = state["lesson_id"]
    plan = state.get("lesson_plan") or {}
    sections = state.get("generated_sections", [])
    figures = state.get("generated_figures", [])
    student_profile = state.get("student_profile", {})

    # Build figure lookup: section_index → list of figures
    figures_by_section: dict[int, list[dict]] = {}
    for fig in figures:
        idx = fig.get("section_index", 0)
        figures_by_section.setdefault(idx, []).append(fig)

    # Enrich sections with their figures
    enriched_sections = []
    for i, section in enumerate(sections):
        enriched_sections.append({
            **section,
            "figures": figures_by_section.get(i, []),
            "index": i,
        })

    env = _get_jinja_env()
    template = env.get_template("lesson.html.j2")

    student_name = student_profile.get("name", "Student") if student_profile else "Student"

    html_content = template.render(
        lesson_id=lesson_id,
        title=plan.get("title", "Lesson"),
        subject=plan.get("subject", ""),
        grade_level=plan.get("grade_level", ""),
        duration_minutes=plan.get("estimated_duration_minutes", 30),
        learning_objectives=plan.get("learning_objectives", []),
        sections=enriched_sections,
        all_figures=figures,
        student_name=student_name,
        generated_at=datetime.now(timezone.utc).strftime("%B %d, %Y"),
    )

    # Write HTML
    html_path = lessons_dir / f"{lesson_id}.html"
    async with aiofiles.open(html_path, "w", encoding="utf-8") as f:
        await f.write(html_content)

    # Write metadata JSON
    meta = {
        "lesson_id": lesson_id,
        "title": plan.get("title", "Lesson"),
        "topic": state.get("topic", ""),
        "student_id": state.get("student_id"),
        "grade_level": plan.get("grade_level", ""),
        "subject": plan.get("subject", ""),
        "duration_minutes": plan.get("estimated_duration_minutes", 30),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "html_url": f"/lessons/{lesson_id}.html",
    }
    meta_path = lessons_dir / f"{lesson_id}.json"
    async with aiofiles.open(meta_path, "w", encoding="utf-8") as f:
        await f.write(json.dumps(meta, indent=2))

    return html_path
