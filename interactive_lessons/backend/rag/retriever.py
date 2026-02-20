from __future__ import annotations

import re

from backend.config import get_settings


def retrieve(student_id: str, query: str, top_k: int = 5) -> list[str]:
    """
    Retrieve relevant chunks from ChromaDB for a student.

    Args:
        student_id: Student identifier
        query: Search query (topic + objectives + grade level)
        top_k: Number of chunks to return

    Returns:
        List of text chunks, most relevant first
    """
    import chromadb
    from chromadb.utils import embedding_functions

    settings = get_settings()
    client = chromadb.PersistentClient(path=settings.chroma_db_path)

    collection_name = f"student_{re.sub(r'[^a-zA-Z0-9_]', '_', student_id)}"

    try:
        ef = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="all-MiniLM-L6-v2"
        )
        collection = client.get_collection(name=collection_name, embedding_function=ef)
    except Exception:
        return []

    count = collection.count()
    if count == 0:
        return []

    results = collection.query(
        query_texts=[query],
        n_results=min(top_k, count),
    )

    documents = results.get("documents", [[]])[0]
    return documents
