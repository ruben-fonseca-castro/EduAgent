"""Lesson engine LangGraph definition — adapted from friend_code.

7-node pipeline: parse_input → plan_lesson → [retrieve_student_context] → generate_content → [generate_figures] → assemble_html → review_lesson
"""

from __future__ import annotations

from typing import Literal

from langgraph.graph import END, START, StateGraph

from app.lesson_engine.nodes import (
    assemble_html,
    generate_content,
    generate_figures,
    parse_input,
    plan_lesson,
    retrieve_student_context,
    review_lesson,
)
from app.lesson_engine.state import LessonState


def _route_after_plan(state: LessonState) -> Literal["retrieve_student_context", "generate_content"]:
    plan = state.get("lesson_plan") or {}
    if plan.get("needs_rag") and state.get("student_id"):
        return "retrieve_student_context"
    return "generate_content"


def _route_after_content(state: LessonState) -> Literal["generate_figures", "assemble_html"]:
    plan = state.get("lesson_plan") or {}
    if plan.get("needs_figures") and plan.get("figure_requests"):
        return "generate_figures"
    return "assemble_html"


def _route_after_review(state: LessonState) -> Literal["generate_content", "__end__"]:
    review = state.get("review_result")
    iteration = state.get("iteration_count", 0)
    if review and not review.passed and iteration < 1:  # Max 1 iteration
        return "generate_content"
    return "__end__"


def build_graph() -> StateGraph:
    graph = StateGraph(LessonState)

    # Add nodes
    graph.add_node("parse_input", parse_input)
    graph.add_node("plan_lesson", plan_lesson)
    graph.add_node("retrieve_student_context", retrieve_student_context)
    graph.add_node("generate_content", generate_content)
    graph.add_node("generate_figures", generate_figures)
    graph.add_node("assemble_html", assemble_html)
    graph.add_node("review_lesson", review_lesson)

    # Entry
    graph.add_edge(START, "parse_input")
    graph.add_edge("parse_input", "plan_lesson")

    # After plan: conditional RAG
    graph.add_conditional_edges(
        "plan_lesson",
        _route_after_plan,
        {
            "retrieve_student_context": "retrieve_student_context",
            "generate_content": "generate_content",
        },
    )

    graph.add_edge("retrieve_student_context", "generate_content")

    # After content: conditional figures
    graph.add_conditional_edges(
        "generate_content",
        _route_after_content,
        {
            "generate_figures": "generate_figures",
            "assemble_html": "assemble_html",
        },
    )

    graph.add_edge("generate_figures", "assemble_html")
    graph.add_edge("assemble_html", "review_lesson")

    # After review: loop or end
    graph.add_conditional_edges(
        "review_lesson",
        _route_after_review,
        {
            "generate_content": "generate_content",
            "__end__": END,
        },
    )

    return graph.compile()
