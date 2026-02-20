# ── Stage 1: Download sentence-transformers model ────────────────────────────
FROM python:3.11-slim AS model-downloader

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

RUN uv pip install --system --no-cache sentence-transformers==3.3.1

RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2', cache_folder='/models')"

# ── Stage 2: Final application image ─────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# System dependencies for pdfplumber and Chromadb
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpoppler-cpp-dev \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy pre-downloaded model
COPY --from=model-downloader /models /models

# Set sentence-transformers to use pre-downloaded model
ENV SENTENCE_TRANSFORMERS_HOME=/models

# Install Python dependencies
COPY requirements.txt .
RUN uv pip install --system --no-cache -r requirements.txt

# Copy application code
COPY . .

# Create data directories
RUN mkdir -p data/chroma_db data/generated_lessons data/student_context

# Environment defaults
ENV APP_HOST=0.0.0.0
ENV APP_PORT=8000
ENV CHROMA_DB_PATH=/app/data/chroma_db
ENV LESSONS_DIR=/app/data/generated_lessons
ENV STUDENT_CONTEXT_DIR=/app/data/student_context
ENV MCP_SERVER_PATH=/app/backend/mcp_servers/python_executor.py

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
