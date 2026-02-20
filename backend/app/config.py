"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Database ─────────────────────────────────────────────────────────────
    # SQLite for local dev; swap to Oracle URL for production:
    #   oracle+oracledb://system:pass@localhost:1521/?service_name=FREEPDB1
    DATABASE_URL: str = "sqlite:///./campus_market.db"

    # ── Auth ─────────────────────────────────────────────────────────────────
    SECRET_KEY: str = "hackathon-dev-secret-change-in-prod-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # ── Oracle GenAI (OCI request signing) ────────────────────────────────────
    # OCI config file + profile used by SDK auth provider.
    OCI_CONFIG_FILE: str = "~/.oci/config"
    OCI_CONFIG_PROFILE: str = "DEFAULT"
    # Optional explicit endpoint. If blank, we auto-derive from region in config.
    ORACLE_GENAI_BASE_URL: str = ""
    # Model OCID or model name, e.g.:
    #   ocid1.generativeaimodel.oc1....
    #   cohere.command-r-plus
    #   meta.llama-3.1-70b-instruct
    ORACLE_GENAI_MODEL: str = "meta.llama-3.1-70b-instruct"
    # Chat payload format: AUTO | COHERE | GENERIC
    # Use COHERE when ORACLE_GENAI_MODEL is an OCID for a Cohere model.
    ORACLE_GENAI_API_FORMAT: str = "AUTO"
    # Compartment/tenancy OCID (as used in OCI Console code snippets)
    ORACLE_GENAI_COMPARTMENT_ID: str = ""

    # Legacy bearer key (no longer used in Option A, kept for compatibility only)
    ORACLE_GENAI_API_KEY: str = ""

    # ── Anthropic Claude (optional backup, not used when OCI is configured) ───
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-3-5-haiku-20241022"

    # ── CORS ─────────────────────────────────────────────────────────────────
    # Comma-separated list of allowed origins.
    # Dev default allows localhost. Production: set in .env.prod
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # ── Economy ───────────────────────────────────────────────────────────────
    DEFAULT_BLUE_COINS: int = 1000
    MAX_PORTFOLIO_RISK_PCT: int = 50

    # ── LMSR defaults ─────────────────────────────────────────────────────────
    DEFAULT_B_PARAM: float = 100.0
    DEFAULT_MAX_POSITION: int = 500
    DEFAULT_MAX_DAILY_SPEND: int = 200

    # ── Classroom / RAG ────────────────────────────────────────────────────────
    UPLOAD_DIR: str = "./uploads"
    EMBEDDING_MODEL: str = "cohere.embed-english-v3.0"
    RAG_CHUNK_SIZE: int = 500
    RAG_CHUNK_OVERLAP: int = 50
    RAG_TOP_K: int = 5

    # ── Personal RAG (ChromaDB) ──────────────────────────────────────────────
    CHROMA_DB_PATH: str = "./data/chroma_db"
    STUDENT_CONTEXT_DIR: str = "./data/student_context"

    # ── Lesson Engine ────────────────────────────────────────────────────────
    GENERATED_LESSONS_DIR: str = "./data/generated_lessons"
    LESSON_LLM_TEMPERATURE: float = 0.7

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
