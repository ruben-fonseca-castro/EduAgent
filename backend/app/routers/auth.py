"""Auth router — registration, login, and user info."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserResponse
from app.middleware.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)
from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── Demo accounts ─────────────────────────────────────────────────────────────
# Three pre-seeded student accounts + one teacher account for hackathon judges.
# Passwords are simple for demo; accounts are created on first use.
DEMO_ACCOUNTS = [
    {
        "email": "demo.student1@astra.edu",
        "password": "AstraDemo2025!",
        "display_name": "Demo Student 1",
        "role": "student",
        "key": "student1",
    },
    {
        "email": "demo.student2@astra.edu",
        "password": "AstraDemo2025!",
        "display_name": "Demo Student 2",
        "role": "student",
        "key": "student2",
    },
    {
        "email": "demo.student3@astra.edu",
        "password": "AstraDemo2025!",
        "display_name": "Demo Student 3",
        "role": "student",
        "key": "student3",
    },
    {
        "email": "demo.teacher@astra.edu",
        "password": "AstraDemo2025!",
        "display_name": "Demo Teacher",
        "role": "teacher",
        "key": "teacher",
    },
]


def _ensure_demo_account(db: Session, account: dict) -> User:
    """Get or create a demo account, returning the User row."""
    user = db.query(User).filter(User.email == account["email"]).first()
    if not user:
        user = User(
            email=account["email"],
            password_hash=hash_password(account["password"]),
            role=account["role"],
            display_name=account["display_name"],
            blue_coins=float(settings.DEFAULT_BLUE_COINS),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@router.post("/register", response_model=UserResponse, status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user."""
    if req.role not in ("student", "teacher"):
        raise HTTPException(status_code=400, detail="Role must be 'student' or 'teacher'")

    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        role=req.role,
        display_name=req.display_name,
        blue_coins=float(settings.DEFAULT_BLUE_COINS),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return UserResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        display_name=user.display_name,
        blue_coins=user.blue_coins,
        created_at=user.created_at.isoformat(),
    )


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """Login and get JWT token."""
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": user.id, "role": user.role})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        role=current_user.role,
        display_name=current_user.display_name,
        blue_coins=current_user.blue_coins,
        created_at=current_user.created_at.isoformat(),
    )


# ── Demo endpoints ────────────────────────────────────────────────────────────

@router.post("/demo/{account_key}", response_model=TokenResponse)
def demo_login(account_key: str, db: Session = Depends(get_db)):
    """Instantly log in as a pre-seeded demo account (student1/2/3 or teacher).

    Creates the account if it doesn't exist yet, then returns a JWT.
    No password required — intended for hackathon judges only.
    """
    account = next((a for a in DEMO_ACCOUNTS if a["key"] == account_key), None)
    if not account:
        raise HTTPException(status_code=404, detail=f"Unknown demo account '{account_key}'. Valid keys: student1, student2, student3, teacher")

    user = _ensure_demo_account(db, account)
    token = create_access_token({"sub": user.id, "role": user.role})
    return TokenResponse(access_token=token)


@router.post("/demo/reset/all")
def reset_demo_accounts(db: Session = Depends(get_db)):
    """Reset all demo student accounts to their blank state.

    Clears: student profile (quiz, resume, learning style), classroom sessions,
    generated lessons, performance reports, and ChromaDB personal RAG vectors.
    The accounts themselves are preserved so judges can log back in immediately.
    Demo teacher account is NOT reset (keeps courses/materials intact).
    """
    import json as _json
    from app.models.student_profile import StudentProfile
    from app.models.classroom_session import ClassroomSession
    from app.models.generated_lesson import GeneratedLesson

    reset_count = 0
    for account in DEMO_ACCOUNTS:
        if account["role"] != "student":
            continue

        user = db.query(User).filter(User.email == account["email"]).first()
        if not user:
            continue  # Account never created — nothing to reset

        # 1. Delete student profile (quiz answers, resume, learning style, additional_details)
        db.query(StudentProfile).filter(StudentProfile.user_id == user.id).delete()

        # 2. Delete all classroom sessions for this student
        db.query(ClassroomSession).filter(ClassroomSession.user_id == user.id).delete()

        # 3. Delete all generated lessons for this student
        db.query(GeneratedLesson).filter(GeneratedLesson.user_id == user.id).delete()

        # 4. Try to delete performance reports if model exists
        try:
            from app.models.performance_report import PerformanceReport
            db.query(PerformanceReport).filter(PerformanceReport.user_id == user.id).delete()
        except Exception:
            pass

        # 5. Reset blue_coins to default
        user.blue_coins = float(settings.DEFAULT_BLUE_COINS)

        # 6. Wipe ChromaDB personal RAG collection for this student
        try:
            import chromadb
            from app.config import settings as app_settings
            chroma_client = chromadb.PersistentClient(path=app_settings.CHROMA_DB_PATH)
            collection_name = f"student_{user.id}"
            try:
                chroma_client.delete_collection(collection_name)
            except Exception:
                pass  # Collection may not exist
        except Exception:
            pass

        reset_count += 1

    db.commit()
    return {
        "status": "ok",
        "message": f"Reset {reset_count} demo student account(s). Accounts still exist — judges can log in again immediately.",
        "reset_accounts": [a["display_name"] for a in DEMO_ACCOUNTS if a["role"] == "student"],
    }
