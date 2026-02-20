"""SQLAlchemy engine and session management.

Supports both Oracle 23ai (production) and SQLite (local dev/testing).
Set DATABASE_URL in .env to switch:
  - SQLite:  sqlite:///./campus_market.db
  - Oracle:  oracle+oracledb://system:pass@host:1521/?service_name=FREEPDB1
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import settings

# Detect SQLite vs Oracle and set engine args accordingly
connect_args = {}
engine_kwargs: dict = {
    "echo": False,
}

if settings.DATABASE_URL.startswith("sqlite"):
    # SQLite needs check_same_thread=False for FastAPI's threaded model
    connect_args["check_same_thread"] = False
    engine_kwargs["connect_args"] = connect_args
else:
    # Oracle / Postgres connection pool settings
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20
    engine_kwargs["pool_pre_ping"] = True

engine = create_engine(settings.DATABASE_URL, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
