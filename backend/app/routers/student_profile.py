"""Student profile router — identity quiz, resume upload, profile retrieval."""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.student_profile import StudentProfile
from app.schemas.student_profile import (
    IdentityQuizSubmission,
    StudentProfileResponse,
    QuizCheckResponse,
)
from app.middleware.auth import get_current_user, require_student

router = APIRouter(prefix="/api/student-profile", tags=["student-profile"])

# ── Identity Quiz Questions ──────────────────────────────────────────────────

QUIZ_QUESTIONS = [
    {
        "id": 1,
        "question": "When learning something new, I prefer to:",
        "options": {
            "A": "Watch a video or demonstration",
            "B": "Read about it in a textbook or article",
            "C": "Try it out hands-on immediately",
            "D": "Discuss it with others",
        },
    },
    {
        "id": 2,
        "question": "When solving a difficult problem, I tend to:",
        "options": {
            "A": "Draw diagrams or visualize the solution",
            "B": "Write out step-by-step logic",
            "C": "Experiment with different approaches",
            "D": "Talk through it with someone else",
        },
    },
    {
        "id": 3,
        "question": "I remember information best when I:",
        "options": {
            "A": "See it in charts, graphs, or images",
            "B": "Read it multiple times",
            "C": "Practice using it in real situations",
            "D": "Explain it to someone else",
        },
    },
    {
        "id": 4,
        "question": "My ideal study environment is:",
        "options": {
            "A": "Quiet with visual aids like flashcards",
            "B": "A library with good reading material",
            "C": "A lab or workshop where I can practice",
            "D": "A study group where we discuss topics",
        },
    },
    {
        "id": 5,
        "question": "When I encounter a concept I don't understand, I first:",
        "options": {
            "A": "Look for a diagram or infographic",
            "B": "Search for a detailed written explanation",
            "C": "Try to apply it to a simple example",
            "D": "Ask someone to explain it differently",
        },
    },
    {
        "id": 6,
        "question": "In a class or lecture, I engage most when:",
        "options": {
            "A": "The instructor uses slides and visual demos",
            "B": "Detailed notes and references are provided",
            "C": "There are interactive exercises and labs",
            "D": "There's group discussion and Q&A",
        },
    },
    {
        "id": 7,
        "question": "I prefer feedback that is:",
        "options": {
            "A": "Visual — highlighted areas, annotated work",
            "B": "Written — detailed comments and explanations",
            "C": "Practical — showing me what to fix and letting me redo it",
            "D": "Verbal — a conversation about how to improve",
        },
    },
    {
        "id": 8,
        "question": "When preparing for an exam, my go-to strategy is:",
        "options": {
            "A": "Creating mind maps and visual summaries",
            "B": "Re-reading notes and textbooks",
            "C": "Doing practice problems and past exams",
            "D": "Teaching the material to a friend or study partner",
        },
    },
    {
        "id": 9,
        "question": "I'm most motivated to learn when:",
        "options": {
            "A": "I can see the big picture and how things connect",
            "B": "I have comprehensive material to master",
            "C": "I can immediately apply what I learn to real problems",
            "D": "I'm learning alongside peers with shared goals",
        },
    },
    {
        "id": 10,
        "question": "The pace at which I prefer to learn new topics is:",
        "options": {
            "A": "Fast — give me the overview, I'll fill in details as needed",
            "B": "Moderate — thorough coverage with time to absorb",
            "C": "Hands-on — learn by doing, revisit theory later",
            "D": "Collaborative — match the group's pace, discuss as we go",
        },
    },
]


def _format_quiz_for_indexing(answers: list[dict]) -> list[dict]:
    """Format quiz answers with question text for RAG indexing."""
    question_map = {q["id"]: q for q in QUIZ_QUESTIONS}
    formatted = []
    for ans in answers:
        q = question_map.get(ans.get("question_id"))
        if q:
            answer_text = q["options"].get(ans.get("answer", ""), "Unknown")
            formatted.append({
                "question_id": q["id"],
                "question_text": q["question"],
                "answer_letter": ans.get("answer", ""),
                "answer_text": answer_text,
            })
    return formatted


@router.get("/quiz-questions")
def get_quiz_questions():
    """Return the identity quiz questions (public endpoint for frontend)."""
    return QUIZ_QUESTIONS


@router.post("/quiz", response_model=StudentProfileResponse)
async def submit_quiz(
    submission: IdentityQuizSubmission,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Submit the 10-question identity quiz. Creates or updates student profile."""
    # Check if profile already exists
    existing = db.query(StudentProfile).filter(
        StudentProfile.user_id == current_user.id
    ).first()

    # Format answers for storage
    raw_answers = [{"question_id": a.question_id, "answer": a.answer} for a in submission.answers]
    formatted_answers = _format_quiz_for_indexing(raw_answers)

    if existing:
        profile = existing
        profile.quiz_responses = json.dumps(formatted_answers)
        profile.additional_details = submission.additional_details
        profile.grade_level = submission.grade_level
        profile.subjects = json.dumps(submission.subjects)
        profile.updated_at = datetime.now(timezone.utc)
    else:
        profile = StudentProfile(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            quiz_responses=json.dumps(formatted_answers),
            additional_details=submission.additional_details,
            grade_level=submission.grade_level,
            subjects=json.dumps(submission.subjects),
        )
        db.add(profile)

    db.commit()
    db.refresh(profile)

    # Generate AI learning style summary
    try:
        from app.services.ai_client import chat

        quiz_text = "\n".join(
            f"Q{a['question_id']}: {a['question_text']}\nA: ({a['answer_letter']}) {a['answer_text']}"
            for a in formatted_answers
        )

        summary = await chat(
            system=(
                "You are an educational psychologist analyzing a student's learning preferences. "
                "Based on their quiz answers, create a concise learning style profile (2-3 sentences). "
                "Identify their primary learning modality (visual, reading, kinesthetic, social), "
                "preferred pace, and most effective study strategies. Be specific and actionable."
            ),
            messages=[{
                "role": "user",
                "content": (
                    f"Student: {current_user.display_name}\n"
                    f"Grade Level: {submission.grade_level}\n"
                    f"Subjects: {', '.join(submission.subjects)}\n"
                    f"Additional Details: {submission.additional_details}\n\n"
                    f"Quiz Responses:\n{quiz_text}"
                ),
            }],
            max_tokens=300,
            temperature=0.5,
        )

        profile.learning_style_summary = summary.strip()
        db.commit()
    except Exception:
        pass  # AI summary is best-effort

    # Index into personal ChromaDB
    try:
        from app.services.personal_rag import (
            index_quiz_responses,
            index_additional_details,
            index_learning_style_summary,
        )

        index_quiz_responses(current_user.id, formatted_answers)

        if submission.additional_details:
            index_additional_details(current_user.id, submission.additional_details)

        if profile.learning_style_summary:
            index_learning_style_summary(current_user.id, profile.learning_style_summary)

        profile.chroma_indexed = True
        db.commit()
    except Exception:
        pass  # RAG indexing is best-effort

    subjects = json.loads(profile.subjects) if profile.subjects else []

    return StudentProfileResponse(
        id=profile.id,
        user_id=profile.user_id,
        quiz_completed=True,
        learning_style_summary=profile.learning_style_summary,
        grade_level=profile.grade_level or "undergraduate",
        subjects=subjects,
        additional_details=profile.additional_details,
        resume_uploaded=bool(profile.resume_text),
        created_at=profile.created_at.isoformat(),
    )


@router.post("/resume", response_model=StudentProfileResponse)
async def upload_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Upload a resume (PDF/DOCX) to enrich the student's personal RAG."""
    profile = db.query(StudentProfile).filter(
        StudentProfile.user_id == current_user.id
    ).first()
    if not profile:
        raise HTTPException(status_code=400, detail="Complete the identity quiz first")

    # Save file
    from pathlib import Path
    upload_dir = Path(settings.STUDENT_CONTEXT_DIR) / current_user.id
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_path = upload_dir / file.filename
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    profile.resume_path = str(file_path)

    # Extract text
    try:
        if file.filename.lower().endswith(".pdf"):
            from pypdf import PdfReader
            reader = PdfReader(str(file_path))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        elif file.filename.lower().endswith((".docx", ".doc")):
            import docx
            doc = docx.Document(str(file_path))
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        else:
            text = content.decode("utf-8", errors="ignore")

        profile.resume_text = text
        profile.updated_at = datetime.now(timezone.utc)
        db.commit()

        # Index into ChromaDB
        from app.services.personal_rag import index_resume
        index_resume(current_user.id, text)
    except Exception:
        pass  # Resume extraction is best-effort

    db.commit()
    db.refresh(profile)

    from app.config import settings  # noqa: already imported at module level
    subjects = json.loads(profile.subjects) if profile.subjects else []

    return StudentProfileResponse(
        id=profile.id,
        user_id=profile.user_id,
        quiz_completed=bool(profile.quiz_responses),
        learning_style_summary=profile.learning_style_summary,
        grade_level=profile.grade_level or "undergraduate",
        subjects=subjects,
        additional_details=profile.additional_details,
        resume_uploaded=bool(profile.resume_text),
        created_at=profile.created_at.isoformat(),
    )


@router.get("/me", response_model=StudentProfileResponse)
def get_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Get the current student's profile."""
    profile = db.query(StudentProfile).filter(
        StudentProfile.user_id == current_user.id
    ).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found. Complete the identity quiz first.")

    subjects = json.loads(profile.subjects) if profile.subjects else []

    return StudentProfileResponse(
        id=profile.id,
        user_id=profile.user_id,
        quiz_completed=bool(profile.quiz_responses),
        learning_style_summary=profile.learning_style_summary,
        grade_level=profile.grade_level or "undergraduate",
        subjects=subjects,
        additional_details=profile.additional_details,
        resume_uploaded=bool(profile.resume_text),
        created_at=profile.created_at.isoformat(),
    )


@router.get("/check", response_model=QuizCheckResponse)
def check_quiz(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check if the current user has completed the identity quiz."""
    if current_user.role != "student":
        return QuizCheckResponse(quiz_completed=True, profile_id=None)

    profile = db.query(StudentProfile).filter(
        StudentProfile.user_id == current_user.id
    ).first()

    if profile and profile.quiz_responses:
        return QuizCheckResponse(quiz_completed=True, profile_id=profile.id)

    return QuizCheckResponse(quiz_completed=False, profile_id=None)
