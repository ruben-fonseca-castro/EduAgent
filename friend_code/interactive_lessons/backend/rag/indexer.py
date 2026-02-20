from __future__ import annotations

import re
from pathlib import Path

from backend.config import get_settings

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100


def _chunk_text(text: str) -> list[str]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


def _get_collection(student_id: str):
    """Get or create a ChromaDB collection for this student."""
    import chromadb
    from chromadb.utils import embedding_functions

    settings = get_settings()
    client = chromadb.PersistentClient(path=settings.chroma_db_path)

    # ChromaDB collection names: alphanumeric + underscores, no hyphens
    collection_name = f"student_{re.sub(r'[^a-zA-Z0-9_]', '_', student_id)}"

    ef = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name="all-MiniLM-L6-v2"
    )

    return client.get_or_create_collection(
        name=collection_name,
        embedding_function=ef,
        metadata={"student_id": student_id},
    )


def index_files(student_id: str, files: list[tuple[str, str]]) -> list[str]:
    """
    Index text content into ChromaDB for a student.

    Args:
        student_id: Student identifier
        files: List of (filename, text_content) tuples

    Returns:
        List of chunk IDs indexed
    """
    collection = _get_collection(student_id)
    all_ids = []

    for filename, text in files:
        if not text.strip():
            continue

        chunks = _chunk_text(text)
        ids = []
        documents = []
        metadatas = []

        for i, chunk in enumerate(chunks):
            chunk_id = f"{student_id}_{re.sub(r'[^a-zA-Z0-9]', '_', filename)}_{i}"
            ids.append(chunk_id)
            documents.append(chunk)
            metadatas.append({
                "source_file": filename,
                "chunk_index": i,
                "student_id": student_id,
            })

        if ids:
            # Upsert to handle re-indexing
            collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
            all_ids.extend(ids)

    return all_ids
