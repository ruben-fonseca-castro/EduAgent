"""Lesson engine state definitions — TypedDicts for graph state and Pydantic models for LLM output.

Copied from friend_code/interactive_lessons/backend/agent/state.py with no changes.
"""

from __future__ import annotations

from typing import Annotated, Optional

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field
from typing_extensions import TypedDict


# ── Pydantic models (for structured LLM output) ───────────────────────────────

class PlotlyFigureSchema(BaseModel):
    """Schema for a generated Plotly figure."""
    code: str = Field(description="Python code to create a plotly.graph_objects Figure assigned to variable 'fig'")

class MermaidFigureSchema(BaseModel):
    """Schema for a generated Mermaid diagram."""
    syntax: str = Field(description="The valid mermaid syntax string without markdown formatting or codeblocks")

class LessonSectionSchema(BaseModel):
    """Schema for a single section within a lesson plan. This must be a JSON object, not a string."""
    title: str
    content_type: str  # "text" | "equation" | "code_example" | "exercise"
    description: str


class FigureRequest(BaseModel):
    """Schema for requesting a figure generation. This must be a JSON object, not a string."""
    type: str  # "plotly" | "mermaid" | "mathjax"
    description: str
    section_index: int


class LessonPlanSchema(BaseModel):
    """Structured lesson plan with sections and figure requests."""
    title: str
    grade_level: str  # "middle_school" | "high_school" | "undergraduate" | "professional"
    subject: str
    learning_objectives: list[str]
    sections: list[LessonSectionSchema]
    needs_rag: bool
    needs_figures: bool
    figure_requests: list[FigureRequest]
    estimated_duration_minutes: int


class ReviewResult(BaseModel):
    """Review feedback for generated lesson content."""
    passed: bool
    issues: list[str]


# ── TypedDicts for the graph state ────────────────────────────────────────────

class LessonSection(TypedDict):
    title: str
    content_type: str
    description: str
    generated_content: str  # HTML string
    figure_ids: list[str]


class LessonPlan(TypedDict):
    title: str
    grade_level: str
    subject: str
    learning_objectives: list[str]
    sections: list[LessonSection]
    needs_rag: bool
    needs_figures: bool
    figure_requests: list[dict]
    estimated_duration_minutes: int


class GeneratedFigure(TypedDict):
    figure_id: str
    figure_type: str   # "plotly" | "mermaid" | "mathjax"
    title: str
    data: str          # plotly JSON | mermaid syntax | LaTeX string
    section_index: int


class LessonState(TypedDict):
    # Input
    lesson_id: str
    raw_input: str
    input_type: str     # "prompt" | "pdf"
    student_id: Optional[str]

    # parse_input
    topic: str
    extracted_text: str

    # plan_lesson
    lesson_plan: Optional[LessonPlan]

    # retrieve_student_context
    student_context: str
    student_profile: dict

    # generate_content (streaming)
    messages: Annotated[list[BaseMessage], add_messages]
    generated_sections: list[LessonSection]

    # generate_figures
    generated_figures: list[GeneratedFigure]

    # assemble_html
    final_html: str

    # review_lesson
    review_result: Optional[ReviewResult]
    iteration_count: int

    # Status
    current_node: str
    error: Optional[str]
    completed: bool
