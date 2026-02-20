"""Personal RAG service — per-student ChromaDB collections for personalized context.

Adapts the friend's rag/indexer.py + rag/retriever.py into a unified service
that manages ChromaDB collections for each student, storing quiz data, resumes,
and performance reports, and retrieves them alongside the global course RAG.
"""

from __future__ import annotations

import re
from typing import Optional

import chromadb
from chromadb.utils import embedding_functions

from app.config import settings


# ── Singleton ChromaDB client ─────────────────────────────────────────────────

_chroma_client: Optional[chromadb.PersistentClient] = None
_embedding_fn = None


def _get_chroma_client() -> chromadb.PersistentClient:
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=settings.CHROMA_DB_PATH)
    return _chroma_client


def _get_embedding_fn():
    global _embedding_fn
    if _embedding_fn is None:
        _embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="all-MiniLM-L6-v2"
        )
    return _embedding_fn


def _sanitize_collection_name(user_id: str) -> str:
    """ChromaDB collection names must be 3-63 chars, start/end with alphanumeric."""
    sanitized = re.sub(r"[^a-zA-Z0-9_-]", "_", user_id)
    name = f"student_{sanitized}"
    # Clamp to 63 chars
    if len(name) > 63:
        name = name[:63]
    return name


# ── Collection management ─────────────────────────────────────────────────────

def get_student_collection(user_id: str):
    """Get or create a ChromaDB collection for a specific student."""
    client = _get_chroma_client()
    collection_name = _sanitize_collection_name(user_id)
    return client.get_or_create_collection(
        name=collection_name,
        embedding_function=_get_embedding_fn(),
    )


# ── Text chunking ────────────────────────────────────────────────────────────

def _chunk_text(text: str, chunk_size: int = 800, overlap: int = 100) -> list[str]:
    """Split text into overlapping chunks."""
    if not text or not text.strip():
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start += chunk_size - overlap
    return chunks


# ── Indexing functions ────────────────────────────────────────────────────────

def index_text(user_id: str, source_name: str, text: str) -> int:
    """Index arbitrary text into a student's personal ChromaDB collection.

    Returns the number of chunks indexed.
    """
    if not text or not text.strip():
        return 0

    collection = get_student_collection(user_id)
    chunks = _chunk_text(text)

    if not chunks:
        return 0

    ids = [f"{source_name}_{i}" for i in range(len(chunks))]
    metadatas = [{"source": source_name, "chunk_index": i, "student_id": user_id} for i in range(len(chunks))]

    collection.upsert(ids=ids, documents=chunks, metadatas=metadatas)
    return len(chunks)


def index_quiz_responses(user_id: str, quiz_data: list[dict]) -> int:
    """Index the student's identity quiz answers into their personal collection.

    quiz_data: list of {question_id, question_text, answer_letter, answer_text}
    """
    # Format quiz into readable text for embedding
    lines = ["Student Learning Profile — Identity Quiz Results:\n"]
    for q in quiz_data:
        lines.append(f"Q{q.get('question_id', '?')}: {q.get('question_text', '')}")
        lines.append(f"Answer: ({q.get('answer_letter', '?')}) {q.get('answer_text', '')}\n")

    text = "\n".join(lines)
    return index_text(user_id, "identity_quiz", text)


def index_resume(user_id: str, resume_text: str) -> int:
    """Index the student's resume text into their personal collection."""
    return index_text(user_id, "resume", resume_text)


def index_additional_details(user_id: str, details: str) -> int:
    """Index the student's additional learning preferences."""
    if not details or not details.strip():
        return 0
    prefixed = f"Student's additional learning preferences and notes:\n{details}"
    return index_text(user_id, "additional_details", prefixed)


def index_learning_style_summary(user_id: str, summary: str) -> int:
    """Index the AI-generated learning style summary."""
    if not summary or not summary.strip():
        return 0
    return index_text(user_id, "learning_style_summary", summary)


def index_performance_report(user_id: str, report_text: str, session_id: str) -> int:
    """Index a teaching performance report into the student's personal collection."""
    if not report_text or not report_text.strip():
        return 0
    prefixed = f"Teaching Performance Report (session {session_id}):\n{report_text}"
    return index_text(user_id, f"report_{session_id}", prefixed)


# ── Retrieval functions ───────────────────────────────────────────────────────

def retrieve_personal_context(user_id: str, query: str, top_k: int = 5) -> list[str]:
    """Retrieve relevant chunks from a student's personal ChromaDB collection.

    Returns list of text chunks, most relevant first.
    """
    try:
        collection = get_student_collection(user_id)
        results = collection.query(query_texts=[query], n_results=top_k)
        if results and results["documents"] and results["documents"][0]:
            return results["documents"][0]
    except Exception:
        pass
    return []


async def retrieve_combined_context(
    user_id: str,
    query: str,
    course_id: str,
    db,
    top_k: int = 5,
) -> dict:
    """Retrieve context from both global RAG (course materials) and personal RAG.

    Returns {"global_context": str, "personal_context": str}
    """
    # Global RAG — existing course materials
    global_context = ""
    try:
        from app.services.rag import retrieve_context
        global_chunks = await retrieve_context(query, course_id, db, top_k=top_k)
        if global_chunks:
            global_context = "\n\n".join(c["content"] for c in global_chunks)
    except Exception:
        pass

    # Personal RAG — student profile, quiz, resume, reports
    personal_chunks = retrieve_personal_context(user_id, query, top_k=top_k)
    personal_context = "\n\n".join(personal_chunks) if personal_chunks else ""

    return {
        "global_context": global_context,
        "personal_context": personal_context,
    }
