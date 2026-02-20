"""Classes router — create, list, and join classes."""

import uuid
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.class_ import Class, ClassEnrollment
from app.schemas.class_ import ClassCreate, ClassJoin, ClassResponse, ClassListResponse
from app.middleware.auth import get_current_user, require_teacher

router = APIRouter(prefix="/api/classes", tags=["classes"])


@router.post("", response_model=ClassResponse, status_code=201)
def create_class(
    req: ClassCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """Create a new class (teacher only). Generates a random invite code."""
    invite_code = secrets.token_hex(4).upper()  # 8 char hex code

    cls = Class(
        id=str(uuid.uuid4()),
        name=req.name,
        teacher_id=current_user.id,
        invite_code=invite_code,
    )
    db.add(cls)

    # Auto-enroll the teacher
    enrollment = ClassEnrollment(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        class_id=cls.id,
    )
    db.add(enrollment)
    db.commit()
    db.refresh(cls)

    return ClassResponse(
        id=cls.id,
        name=cls.name,
        teacher_id=cls.teacher_id,
        invite_code=cls.invite_code,
        created_at=cls.created_at.isoformat(),
    )


@router.get("", response_model=ClassListResponse)
def list_classes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List classes the current user is enrolled in (or teaches)."""
    if current_user.role == "teacher":
        classes = db.query(Class).filter(Class.teacher_id == current_user.id).all()
    else:
        enrollment_class_ids = [
            e.class_id for e in
            db.query(ClassEnrollment).filter(ClassEnrollment.user_id == current_user.id).all()
        ]
        classes = db.query(Class).filter(Class.id.in_(enrollment_class_ids)).all() if enrollment_class_ids else []

    return ClassListResponse(
        classes=[
            ClassResponse(
                id=c.id,
                name=c.name,
                teacher_id=c.teacher_id,
                invite_code=c.invite_code,
                created_at=c.created_at.isoformat(),
            )
            for c in classes
        ]
    )


@router.post("/join", response_model=ClassResponse)
def join_class(
    req: ClassJoin,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Join a class using an invite code (any user)."""
    cls = db.query(Class).filter(Class.invite_code == req.invite_code).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    # Check if already enrolled
    existing = db.query(ClassEnrollment).filter(
        ClassEnrollment.user_id == current_user.id,
        ClassEnrollment.class_id == cls.id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Already enrolled in this class")

    enrollment = ClassEnrollment(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        class_id=cls.id,
    )
    db.add(enrollment)
    db.commit()

    return ClassResponse(
        id=cls.id,
        name=cls.name,
        teacher_id=cls.teacher_id,
        invite_code=cls.invite_code,
        created_at=cls.created_at.isoformat(),
    )
