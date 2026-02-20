"""numénor.ai — FastAPI Application Entry Point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.middleware.rate_limit import limiter
from app.routers import auth, classes, markets, trades, voice, analytics, mcp, explain, courses, classroom, student_profile, lessons, resume_builder
from app.database import engine, Base
from app.services.ai_client import ai_provider_name, ai_health_check

# Create all tables on startup
Base.metadata.create_all(bind=engine)

# Safe column migrations — add new columns to existing tables without data loss
def _add_column_if_missing(table: str, column: str, col_type: str):
    """Add a column to an existing table if it doesn't already exist (SQLite + Oracle safe)."""
    from sqlalchemy import text
    is_sqlite = settings.DATABASE_URL.startswith("sqlite")
    with engine.connect() as conn:
        if is_sqlite:
            result = conn.execute(text(f"PRAGMA table_info({table})"))
            existing_cols = {row[1] for row in result}
        else:
            # Oracle: query user_tab_columns
            result = conn.execute(
                text("SELECT column_name FROM user_tab_columns WHERE table_name = :t"),
                {"t": table.upper()}
            )
            existing_cols = {row[0].lower() for row in result}
        if column not in existing_cols:
            conn.execute(text(f"ALTER TABLE {table} ADD {column} {col_type}"))
            conn.commit()
            print(f"  ✓ Added column {table}.{column}")

_add_column_if_missing("classroom_sessions", "lesson_id", "VARCHAR(36)")

# ── CORS origins from env (supports dev localhost + production domain) ──────
_cors_origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]

app = FastAPI(
    title="numénor.ai",
    description="AI-powered adaptive learning platform.",
    version="1.0.0",
    # Hide docs in production by setting docs_url=None via env if desired
    docs_url="/docs",
    redoc_url="/redoc",
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(classes.router)
app.include_router(markets.router)
app.include_router(trades.router)
app.include_router(voice.router)
app.include_router(analytics.router)
app.include_router(mcp.router)
app.include_router(explain.router)
app.include_router(courses.router)
app.include_router(classroom.router)
app.include_router(student_profile.router)
app.include_router(lessons.router)
app.include_router(resume_builder.router)


@app.on_event("startup")
async def on_startup():
    """Create data directories and log AI provider."""
    from pathlib import Path
    from app.config import settings
    for d in [settings.CHROMA_DB_PATH, settings.STUDENT_CONTEXT_DIR, settings.GENERATED_LESSONS_DIR]:
        Path(d).mkdir(parents=True, exist_ok=True)

    provider = ai_provider_name()
    if provider == "none":
        print("\n" + "="*60)
        print("  ⚠  AI NOT CONFIGURED")
        print("  Configure OCI signing in backend/.env:")
        print("    OCI_CONFIG_FILE=~/.oci/config")
        print("    OCI_CONFIG_PROFILE=DEFAULT")
        print("    ORACLE_GENAI_COMPARTMENT_ID=ocid1.compartment... (or tenancy)")
        print("    ORACLE_GENAI_MODEL=ocid1.generativeaimodel... (or model name)")
        print("  and restart. Visit /api/health/ai to verify.")
        print("="*60 + "\n")
    else:
        print(f"\n  ✓  AI provider: {provider}\n")


@app.get("/")
def root():
    return {
        "name": "Campus Prediction Market API",
        "version": "0.1.0",
        "docs": "/docs",
        "ai_provider": ai_provider_name(),
    }


@app.get("/health")
def health():
    return {"status": "ok", "ai_provider": ai_provider_name()}


@app.get("/api/health/ai")
async def health_ai():
    """Live connectivity test for the configured AI provider.

    Returns:
        provider: which AI is active
        status:   "ok" | "error" | "unconfigured"
        test_reply / error: result of a tiny test call
    """
    return await ai_health_check()
