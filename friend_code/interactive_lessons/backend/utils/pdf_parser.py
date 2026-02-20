from __future__ import annotations

import io
from typing import Optional


async def extract_text_from_upload(upload, content: bytes | None = None) -> str:
    """
    Extract text from an uploaded file (PDF or TXT).

    Tries pdfplumber first, falls back to pypdf, then raw decode.
    """
    if content is None:
        content = await upload.read()

    filename = getattr(upload, "filename", "") or ""

    if filename.lower().endswith(".pdf") or getattr(upload, "content_type", "") == "application/pdf":
        return _extract_pdf(content)
    else:
        # Assume text
        try:
            return content.decode("utf-8")
        except UnicodeDecodeError:
            return content.decode("latin-1", errors="replace")


def _extract_pdf(content: bytes) -> str:
    """Try pdfplumber, fall back to pypdf."""
    text = _try_pdfplumber(content)
    if not text or len(text.strip()) < 50:
        text = _try_pypdf(content)
    return text or ""


def _try_pdfplumber(content: bytes) -> str:
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            pages_text = []
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    pages_text.append(page_text)
            return "\n\n".join(pages_text)
    except Exception:
        return ""


def _try_pypdf(content: bytes) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        pages_text = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages_text.append(text)
        return "\n\n".join(pages_text)
    except Exception:
        return ""


def extract_text_from_path(file_path: str) -> str:
    """Synchronous extraction from a file path."""
    with open(file_path, "rb") as f:
        content = f.read()

    if file_path.lower().endswith(".pdf"):
        return _extract_pdf(content)
    else:
        try:
            return content.decode("utf-8")
        except UnicodeDecodeError:
            return content.decode("latin-1", errors="replace")
