"""RAG pipeline — extract, chunk, embed, and retrieve course materials."""

import json
import math
import asyncio
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.models.course_material import CourseMaterial
from app.models.material_chunk import MaterialChunk


def extract_text(file_path: str, file_type: str) -> str:
    """Extract text from uploaded files."""
    path = Path(file_path)

    if file_type == "pdf":
        try:
            import pdfplumber
            text_parts = []
            with pdfplumber.open(path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)
            return "\n\n".join(text_parts)
        except Exception as e:
            raise RuntimeError(f"PDF extraction failed: {e}") from e

    elif file_type == "doc":
        try:
            import docx
            doc = docx.Document(path)
            return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except Exception as e:
            raise RuntimeError(f"DOCX extraction failed: {e}") from e

    elif file_type == "image":
        # For images, store a description placeholder — real OCR would go here
        return f"[Image file: {path.name}]"

    elif file_type == "video":
        # Video — store metadata placeholder
        return f"[Video file: {path.name}]"

    else:
        # Try reading as plain text
        try:
            return path.read_text(encoding="utf-8")
        except Exception:
            return f"[Unsupported file: {path.name}]"


def chunk_text(
    text: str,
    chunk_size: int | None = None,
    overlap: int | None = None,
) -> list[str]:
    """Split text into overlapping chunks by character count."""
    chunk_size = chunk_size or settings.RAG_CHUNK_SIZE
    overlap = overlap or settings.RAG_CHUNK_OVERLAP

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


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


async def embed_chunks(chunks: list[str]) -> list[list[float]]:
    """Embed text chunks using the configured embedding model."""
    from app.services.ai_client import oracle_embed, _oracle_configured

    if not _oracle_configured():
        # Return zero vectors as fallback when embeddings aren't configured
        return [[0.0] * 384 for _ in chunks]

    try:
        return await oracle_embed(chunks, model_id=settings.EMBEDDING_MODEL)
    except Exception:
        # Fallback: return zero vectors
        return [[0.0] * 384 for _ in chunks]


async def process_material(material_id: str, db: Session) -> None:
    """Full RAG pipeline: extract text → chunk → embed → store."""
    material = db.query(CourseMaterial).filter(CourseMaterial.id == material_id).first()
    if not material:
        return

    try:
        # Step 1: Extract text
        text = extract_text(material.file_path, material.file_type)

        if not text or text.startswith("["):
            # Non-text content — store as single chunk without embedding
            chunk = MaterialChunk(
                material_id=material.id,
                chunk_index=0,
                content=text or f"[{material.filename}]",
                token_count=len(text.split()) if text else 0,
            )
            db.add(chunk)
            material.status = "ready"
            db.commit()
            return

        # Step 2: Chunk
        chunks = chunk_text(text)

        if not chunks:
            material.status = "ready"
            db.commit()
            return

        # Step 3: Embed
        embeddings = await embed_chunks(chunks)

        # Step 4: Store chunks with embeddings
        for i, (chunk_text_content, embedding) in enumerate(zip(chunks, embeddings)):
            chunk = MaterialChunk(
                material_id=material.id,
                chunk_index=i,
                content=chunk_text_content,
                embedding=json.dumps(embedding),
                token_count=len(chunk_text_content.split()),
            )
            db.add(chunk)

        material.status = "ready"
        db.commit()

    except Exception as e:
        material.status = "error"
        material.error_message = str(e)[:500]
        db.commit()


async def retrieve_context(
    query: str,
    course_id: str,
    db: Session,
    top_k: int | None = None,
) -> list[dict]:
    """Retrieve the most relevant chunks for a query via cosine similarity."""
    top_k = top_k or settings.RAG_TOP_K

    # Get all chunks for this course's materials
    from app.models.course_material import CourseMaterial as CM

    chunks = (
        db.query(MaterialChunk)
        .join(CM, MaterialChunk.material_id == CM.id)
        .filter(CM.course_id == course_id, CM.status == "ready")
        .filter(MaterialChunk.embedding.isnot(None))
        .all()
    )

    if not chunks:
        return []

    # Embed the query
    query_embeddings = await embed_chunks([query])
    query_vec = query_embeddings[0]

    # If all zeros (no embeddings configured), return first few chunks
    if all(v == 0.0 for v in query_vec):
        return [
            {"content": c.content, "score": 1.0, "chunk_index": c.chunk_index}
            for c in chunks[:top_k]
        ]

    # Score each chunk
    scored = []
    for chunk in chunks:
        try:
            chunk_vec = json.loads(chunk.embedding)
            score = _cosine_similarity(query_vec, chunk_vec)
            scored.append((score, chunk))
        except (json.JSONDecodeError, TypeError):
            continue

    # Sort by score descending
    scored.sort(key=lambda x: x[0], reverse=True)

    return [
        {"content": c.content, "score": s, "chunk_index": c.chunk_index}
        for s, c in scored[:top_k]
    ]
