"""Classroom router — learn-by-teaching session management."""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.course import Course
from app.models.classroom_session import ClassroomSession
from app.schemas.classroom import (
    ClassroomSessionCreate,
    ClassroomMessageRequest,
    ClassroomMessageResponse,
    ClassroomAgentResponse,
    ClassroomSessionResponse,
    TeachingEvaluation,
    ClassroomAnalytics,
    StudentReport,
    StyleProfile,
    AvatarState,
    ClassDemographics,
    PerformanceReportSummary,
)
from app.middleware.auth import get_current_user, require_student, require_teacher
from app.agents.classroom_orchestrator import classroom_orchestrator
from app.services.rag import retrieve_context
from app.schemas.student_profile import PerformanceReportResponse

router = APIRouter(prefix="/api/classroom", tags=["classroom"])


@router.post("/sessions", response_model=ClassroomSessionResponse, status_code=201)
def create_session(
    req: ClassroomSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Create or resume a classroom session for a course."""
    course = db.query(Course).filter(Course.id == req.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Check for existing active session (no summary = still active)
    existing = (
        db.query(ClassroomSession)
        .filter(
            ClassroomSession.course_id == req.course_id,
            ClassroomSession.user_id == current_user.id,
        )
        .order_by(ClassroomSession.created_at.desc())
        .first()
    )

    if existing and not existing.summary:
        messages = json.loads(existing.messages) if existing.messages else []
        topics = json.loads(existing.topics_covered) if existing.topics_covered else []
        style = json.loads(existing.style_profile) if existing.style_profile else None
        return ClassroomSessionResponse(
            id=existing.id,
            course_id=existing.course_id,
            messages=messages,
            teaching_score=existing.teaching_score,
            topics_covered=topics,
            style_profile=style,
            summary=existing.summary,
            created_at=existing.created_at.isoformat(),
        )

    # Create new session
    session = ClassroomSession(
        id=str(uuid.uuid4()),
        course_id=req.course_id,
        user_id=current_user.id,
        lesson_id=req.lesson_id,
        messages="[]",
        topics_covered="[]",
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return ClassroomSessionResponse(
        id=session.id,
        course_id=session.course_id,
        messages=[],
        teaching_score=0.0,
        topics_covered=[],
        style_profile=None,
        summary=None,
        created_at=session.created_at.isoformat(),
    )


@router.post("/sessions/{session_id}/opening-question")
async def get_opening_question(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Generate an opening question to kick off the teaching session.

    Returns a short AI-generated greeting + question based on the lesson topic,
    asking the student to explain it. Called once when the teaching phase starts
    with an empty message history.
    """
    session = db.query(ClassroomSession).filter(ClassroomSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your session")

    course = db.query(Course).filter(Course.id == session.course_id).first()
    course_title = course.title if course else "this topic"

    # Get lesson content for context
    lesson_topic = course_title
    lesson_summary = ""
    if session.lesson_id:
        try:
            from app.models.generated_lesson import GeneratedLesson
            lesson = db.query(GeneratedLesson).filter(GeneratedLesson.id == session.lesson_id).first()
            if lesson:
                lesson_topic = lesson.topic or course_title
                if lesson.sections_json:
                    sections = json.loads(lesson.sections_json)
                    # Grab titles + first 200 chars of each section for context
                    section_snippets = [
                        f"- {s.get('title', '')}: {s.get('generated_content', '')[:200]}"
                        for s in sections[:4]
                    ]
                    lesson_summary = "\n".join(section_snippets)
        except Exception:
            pass

    # Get student's style preferences
    style_note = ""
    try:
        from app.models.student_profile import StudentProfile
        profile = db.query(StudentProfile).filter(
            StudentProfile.user_id == current_user.id
        ).first()
        if profile and profile.additional_details and profile.additional_details.strip():
            style_note = (
                f"\nMANDATORY STYLE: {profile.additional_details.strip()} "
                f"Apply this style throughout your response."
            )
    except Exception:
        pass

    from app.services.ai_client import chat as ai_chat

    try:
        context_block = f"\nLesson sections covered:\n{lesson_summary}" if lesson_summary else ""
        question = await ai_chat(
            system=(
                f"You are an enthusiastic AI student who just read a lesson on '{lesson_topic}'. "
                f"Your job is to ask the human student to teach YOU about it so they can solidify their understanding."
                f"{style_note}"
            ),
            messages=[{
                "role": "user",
                "content": (
                    f"Generate a short, warm, engaging opening message to start a teaching session "
                    f"on '{lesson_topic}'.{context_block}\n\n"
                    f"Requirements:\n"
                    f"- 2-3 sentences max\n"
                    f"- Greet the student warmly and express excitement to learn\n"
                    f"- End with ONE specific, open-ended question about a core concept from '{lesson_topic}' "
                    f"that the student must explain (pick something central to the lesson, not trivial)\n"
                    f"- Do NOT answer the question yourself\n"
                    f"- Tone: curious, friendly, like an eager student asking their peer"
                ),
            }],
            max_tokens=150,
            temperature=0.8,
        )
    except Exception:
        question = (
            f"Hey there! I just read the lesson on {lesson_topic} and I'm excited to learn more. "
            f"Could you explain the most important concept from this topic to me? "
            f"Start wherever feels natural!"
        )

    return {
        "question": question,
        "topic": lesson_topic,
        "agent_name": "Alex",
        "persona": "socratic_examiner",
    }


@router.post("/message", response_model=ClassroomMessageResponse)
async def send_message(
    req: ClassroomMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Send a teaching message to the classroom."""
    session = db.query(ClassroomSession).filter(ClassroomSession.id == req.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your session")

    # Get course context
    course = db.query(Course).filter(Course.id == session.course_id).first()
    course_title = course.title if course else "Unknown"

    # RAG: retrieve relevant course material
    rag_results = await retrieve_context(req.text, session.course_id, db)
    rag_context = "\n---\n".join(r["content"] for r in rag_results) if rag_results else ""

    # Personal RAG: retrieve student profile context
    personal_context = ""
    try:
        from app.services.personal_rag import retrieve_personal_context
        personal_chunks = retrieve_personal_context(current_user.id, req.text, top_k=3)
        if personal_chunks:
            personal_context = "\n---\n".join(personal_chunks)
    except Exception:
        pass

    # Always inject student profile preferences directly (not just via ChromaDB retrieval)
    # This ensures style instructions like "speak in a southern accent" are ALWAYS honoured
    try:
        from app.models.student_profile import StudentProfile
        profile = db.query(StudentProfile).filter(
            StudentProfile.user_id == current_user.id
        ).first()
        if profile:
            profile_lines = []
            if profile.additional_details and profile.additional_details.strip():
                profile_lines.append(
                    f"MANDATORY STYLE INSTRUCTIONS from the student "
                    f"(you MUST follow these in every response): "
                    f"{profile.additional_details.strip()}"
                )
            if profile.learning_style_summary and profile.learning_style_summary.strip():
                profile_lines.append(
                    f"Student learning style profile: {profile.learning_style_summary.strip()}"
                )
            if profile.grade_level:
                profile_lines.append(f"Student grade level: {profile.grade_level}")
            if profile_lines:
                profile_injection = "\n".join(profile_lines)
                # Prepend so it appears before any ChromaDB-retrieved chunks
                personal_context = (
                    f"{profile_injection}\n\n{personal_context}".strip()
                    if personal_context
                    else profile_injection
                )
    except Exception:
        pass

    # Lesson context: if session has a linked lesson, include its content
    lesson_context = ""
    if session.lesson_id:
        try:
            from app.models.generated_lesson import GeneratedLesson
            lesson = db.query(GeneratedLesson).filter(GeneratedLesson.id == session.lesson_id).first()
            if lesson and lesson.sections_json:
                sections = json.loads(lesson.sections_json)
                lesson_context = "\n\n".join(
                    f"## {s.get('title', '')}\n{s.get('generated_content', '')[:500]}"
                    for s in sections
                )
        except Exception:
            pass

    # Parse existing state
    messages = json.loads(session.messages) if session.messages else []
    current_style = json.loads(session.style_profile) if session.style_profile else None

    # Save current score before orchestrator call (for delta calculation)
    current_score_before = session.teaching_score

    # Process through orchestrator
    result = await classroom_orchestrator.process_message(
        student_text=req.text,
        conversation_history=messages,
        rag_context=rag_context,
        course_title=course_title,
        current_score=session.teaching_score,
        current_style=current_style,
        requested_personas=req.personas if req.personas else None,
        personal_context=personal_context,
        lesson_context=lesson_context,
    )

    # Append messages
    now = datetime.now(timezone.utc).isoformat()
    messages.append({"role": "user", "content": req.text, "timestamp": now})
    for resp in result["agent_responses"]:
        messages.append({
            "role": "assistant",
            "agent_name": resp["agent_name"],
            "persona": resp["persona"],
            "content": resp["message"],
            "avatar_state": resp.get("avatar_state", {"animation": "idle"}),
            "timestamp": now,
        })

    # Update session
    session.messages = json.dumps(messages)
    session.teaching_score = result["teaching_score"]
    session.style_profile = json.dumps(result.get("style_profile", {}))
    session.updated_at = datetime.now(timezone.utc)

    # ── Coin rewards for good teaching ──
    new_score = result["teaching_score"]
    score_delta = new_score - current_score_before

    # Reward algorithm (strict — only rewards quality teaching):
    # - Score must be >= 80 to earn any coins
    # - Response must be substantive (>= 30 words)
    # - Quality tier bonus based on score
    # - Improvement bonus only for significant jumps
    coins_earned = 0.0

    word_count = len(req.text.strip().split())
    is_substantive = word_count >= 30  # Must be a real teaching attempt

    if new_score >= 80 and is_substantive:
        # Quality bonus based on score tier
        if new_score >= 95:
            coins_earned += 30  # Exceptional teaching
        elif new_score >= 90:
            coins_earned += 15  # Excellent teaching
        else:
            coins_earned += 5  # Good teaching (80-89)

        # Improvement bonus — only for clear improvements
        if score_delta > 10:
            coins_earned += 2.0  # Major improvement
        elif score_delta > 5:
            coins_earned += 1.0  # Solid improvement

    # Apply reward only if earned
    if coins_earned > 0:
        from app.services.coin_service import award_coins
        award_coins(db, current_user.id, coins_earned, f"teaching_session:{session.id}")

    # Update topics covered — use LLM to extract short concept tags
    topics = json.loads(session.topics_covered) if session.topics_covered else []
    try:
        from app.services.ai_client import chat as ai_chat
        topic_prompt = (
            f"The student just said: \"{req.text}\"\n\n"
            "Extract 1-3 short topic tags (2-4 words max each) representing the "
            "CS/academic concepts the student is teaching or discussing. "
            "Return ONLY a JSON array of strings, e.g. [\"PageRank\", \"graph traversal\"]. "
            "If no clear topic is identifiable, return []."
        )
        raw = await ai_chat(
            system="You extract academic topic tags from student explanations. Return only a JSON array.",
            messages=[{"role": "user", "content": topic_prompt}],
            max_tokens=60,
            temperature=0.2,
        )
        # Parse the JSON array from the response
        raw = raw.strip()
        if raw.startswith("["):
            new_tags: list = json.loads(raw)
        else:
            # Sometimes model wraps in markdown — extract the bracket content
            import re
            match = re.search(r"\[.*?\]", raw, re.DOTALL)
            new_tags = json.loads(match.group()) if match else []
        for tag in new_tags:
            tag = str(tag).strip()
            if tag and tag not in topics:
                topics.append(tag)
    except Exception:
        pass  # Topic extraction is best-effort; don't fail the whole request
    session.topics_covered = json.dumps(topics)

    db.commit()

    return ClassroomMessageResponse(
        session_id=session.id,
        student_text=req.text,
        agent_responses=[
            ClassroomAgentResponse(
                agent_name=r["agent_name"],
                persona=r["persona"],
                message=r["message"],
                avatar_state=AvatarState(animation=r.get("avatar_state", {}).get("animation", "idle")),
            )
            for r in result["agent_responses"]
        ],
        teaching_score=result["teaching_score"],
        supervisor_feedback=result.get("supervisor_feedback"),
        topics_covered=topics,
        coins_earned=coins_earned,
    )


@router.get("/sessions/{session_id}", response_model=ClassroomSessionResponse)
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a classroom session."""
    session = db.query(ClassroomSession).filter(ClassroomSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = json.loads(session.messages) if session.messages else []
    topics = json.loads(session.topics_covered) if session.topics_covered else []
    style = json.loads(session.style_profile) if session.style_profile else None

    return ClassroomSessionResponse(
        id=session.id,
        course_id=session.course_id,
        messages=messages,
        teaching_score=session.teaching_score,
        topics_covered=topics,
        style_profile=style,
        summary=session.summary,
        created_at=session.created_at.isoformat(),
    )


@router.post("/sessions/{session_id}/evaluate", response_model=TeachingEvaluation)
async def evaluate_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a full teaching evaluation for a session."""
    session = db.query(ClassroomSession).filter(ClassroomSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = json.loads(session.messages) if session.messages else []
    style = json.loads(session.style_profile) if session.style_profile else {}

    # Generate summary
    from app.services.ai_client import chat

    conversation_text = "\n".join(
        f"{'Teacher' if m.get('role') == 'user' else m.get('agent_name', 'Student')}: {m.get('content', '')}"
        for m in messages
    )

    try:
        raw = await chat(
            system=(
                "You are evaluating a student's teaching session. "
                "Provide a teaching evaluation as JSON:\n"
                '{"strengths": ["..."], "areas_to_improve": ["..."], "summary": "..."}'
            ),
            messages=[{
                "role": "user",
                "content": f"Teaching score: {session.teaching_score}/100\n\n{conversation_text}",
            }],
            max_tokens=500,
            temperature=0.3,
        )
        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

        result = json.loads(text)
    except Exception:
        result = {
            "strengths": ["Participated in teaching session"],
            "areas_to_improve": ["Continue practicing explanations"],
            "summary": f"Teaching session with score {session.teaching_score}/100",
        }

    # Save summary to session
    session.summary = result.get("summary", "")
    session.updated_at = datetime.now(timezone.utc)
    db.commit()

    return TeachingEvaluation(
        session_id=session.id,
        teaching_score=session.teaching_score,
        strengths=result.get("strengths", []),
        areas_to_improve=result.get("areas_to_improve", []),
        style_profile=style,
        summary=result.get("summary", ""),
    )


@router.get("/analytics/{course_id}", response_model=ClassroomAnalytics)
def get_analytics(
    course_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """Get comprehensive classroom analytics for a course (teacher only)."""
    from app.models.user import User as UserModel
    from app.models.student_profile import StudentProfile
    from app.models.generated_lesson import GeneratedLesson
    from app.models.performance_report import PerformanceReport

    sessions = (
        db.query(ClassroomSession)
        .filter(ClassroomSession.course_id == course_id)
        .order_by(ClassroomSession.created_at.asc())
        .all()
    )

    empty = ClassroomAnalytics(
        course_id=course_id,
        total_sessions=0,
        avg_teaching_score=0.0,
        active_students=0,
        common_topics=[],
        score_distribution={"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0},
        avg_messages_per_session=0.0,
        total_messages=0,
        high_engagement_count=0,
        medium_engagement_count=0,
        low_engagement_count=0,
        class_style_profile=None,
        student_reports=[],
        class_demographics=None,
    )

    if not sessions:
        return empty

    # ── Per-student grouping ──────────────────────────────────────────────────
    from collections import defaultdict
    student_sessions: dict[str, list[ClassroomSession]] = defaultdict(list)
    for s in sessions:
        student_sessions[s.user_id].append(s)

    # Pre-fetch all student profiles, lessons, and performance reports for efficiency
    student_ids = list(student_sessions.keys())

    profiles_map: dict[str, StudentProfile] = {}
    try:
        profiles = db.query(StudentProfile).filter(StudentProfile.user_id.in_(student_ids)).all()
        profiles_map = {p.user_id: p for p in profiles}
    except Exception:
        pass

    lessons_count_map: dict[str, int] = {}
    total_lessons = 0
    try:
        for uid in student_ids:
            count = db.query(GeneratedLesson).filter(
                GeneratedLesson.user_id == uid,
                GeneratedLesson.course_id == course_id,
            ).count()
            lessons_count_map[uid] = count
            total_lessons += count
    except Exception:
        pass

    reports_map: dict[str, list[PerformanceReport]] = defaultdict(list)
    all_report_scores: list[float] = []
    total_reports = 0
    try:
        reports = db.query(PerformanceReport).filter(
            PerformanceReport.course_id == course_id,
            PerformanceReport.user_id.in_(student_ids),
        ).order_by(PerformanceReport.created_at.desc()).all()
        for r in reports:
            reports_map[r.user_id].append(r)
            all_report_scores.append(r.teaching_score)
            total_reports += 1
    except Exception:
        pass

    # Collect all topics
    all_topics: list[str] = []
    total_messages = 0
    all_scores: list[float] = []
    score_dist = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
    style_keys = ["uses_analogies", "uses_examples", "breaks_down_steps", "checks_understanding", "accuracy"]
    class_style_sums: dict[str, float] = {k: 0.0 for k in style_keys}
    style_count = 0

    student_reports: list[StudentReport] = []

    for uid, student_sess in student_sessions.items():
        # Fetch user display name
        user_obj = db.query(UserModel).filter(UserModel.id == uid).first()
        display_name = user_obj.display_name if user_obj else uid[:8]

        sess_scores: list[float] = []
        sess_dates: list[str] = []
        sess_messages = 0
        sess_topics: list[str] = []
        style_acc: dict[str, float] = {k: 0.0 for k in style_keys}
        style_n = 0
        last_session_at = None

        for s in student_sess:
            msgs = json.loads(s.messages) if s.messages else []
            msg_count = len(msgs)
            sess_messages += msg_count
            all_scores.append(s.teaching_score)
            sess_scores.append(s.teaching_score)

            date_str = s.created_at.isoformat()
            sess_dates.append(date_str)
            last_session_at = date_str

            topics = json.loads(s.topics_covered) if s.topics_covered else []
            sess_topics.extend(topics)
            all_topics.extend(topics)

            if s.style_profile:
                try:
                    sp = json.loads(s.style_profile)
                    for k in style_keys:
                        style_acc[k] += sp.get(k, 0.0)
                    style_n += 1
                except Exception:
                    pass

            # Score distribution
            score = s.teaching_score
            if score <= 20:
                score_dist["0-20"] += 1
            elif score <= 40:
                score_dist["21-40"] += 1
            elif score <= 60:
                score_dist["41-60"] += 1
            elif score <= 80:
                score_dist["61-80"] += 1
            else:
                score_dist["81-100"] += 1

        total_messages += sess_messages
        avg_score = sum(sess_scores) / len(sess_scores) if sess_scores else 0.0
        best_score = max(sess_scores) if sess_scores else 0.0

        # Style profile for this student
        student_style: StyleProfile | None = None
        if style_n > 0:
            student_style = StyleProfile(**{k: round(style_acc[k] / style_n, 3) for k in style_keys})
            for k in style_keys:
                class_style_sums[k] += style_acc[k] / style_n
            style_count += 1

        # Engagement level
        msgs_per_session = sess_messages / len(student_sess) if student_sess else 0
        if msgs_per_session >= 10 or len(student_sess) >= 3:
            engagement = "high"
        elif msgs_per_session >= 4 or len(student_sess) >= 2:
            engagement = "medium"
        else:
            engagement = "low"

        # Simple strengths/weaknesses from style
        strengths: list[str] = []
        areas: list[str] = []
        if student_style:
            if student_style.uses_analogies >= 0.6:
                strengths.append("Uses analogies effectively")
            else:
                areas.append("Incorporate more analogies")
            if student_style.uses_examples >= 0.6:
                strengths.append("Provides concrete examples")
            else:
                areas.append("Add more real-world examples")
            if student_style.breaks_down_steps >= 0.6:
                strengths.append("Breaks concepts into clear steps")
            else:
                areas.append("Structure explanations more sequentially")
            if student_style.checks_understanding >= 0.6:
                strengths.append("Actively checks for understanding")
            else:
                areas.append("Ask more comprehension-check questions")
            if student_style.accuracy >= 0.7:
                strengths.append("High factual accuracy")
            else:
                areas.append("Review source materials for accuracy")

        unique_topics = list(dict.fromkeys(sess_topics))[:10]

        # ── Student profile data ──────────────────────────────────────────────
        profile = profiles_map.get(uid)
        quiz_completed = False
        grade_level = None
        learning_style_summary = None
        subjects: list[str] = []
        resume_uploaded = False
        if profile:
            quiz_completed = bool(profile.quiz_responses)
            grade_level = profile.grade_level
            learning_style_summary = profile.learning_style_summary
            resume_uploaded = bool(profile.resume_path or profile.resume_text)
            try:
                subjects = json.loads(profile.subjects) if profile.subjects else []
            except Exception:
                subjects = []

        # ── Performance reports for this student ──────────────────────────────
        student_perf_reports: list[PerformanceReportSummary] = []
        for r in reports_map.get(uid, [])[:5]:  # Latest 5
            student_perf_reports.append(PerformanceReportSummary(
                id=r.id,
                session_id=r.session_id,
                teaching_score=r.teaching_score,
                strengths=json.loads(r.strengths) if r.strengths else [],
                weaknesses=json.loads(r.weaknesses) if r.weaknesses else [],
                topics_strong=json.loads(r.topics_strong) if r.topics_strong else [],
                topics_weak=json.loads(r.topics_weak) if r.topics_weak else [],
                created_at=r.created_at.isoformat(),
            ))

        student_reports.append(StudentReport(
            user_id=uid,
            display_name=display_name,
            total_sessions=len(student_sess),
            total_messages=sess_messages,
            avg_teaching_score=round(avg_score, 1),
            best_teaching_score=round(best_score, 1),
            last_session_at=last_session_at,
            topics_covered=unique_topics,
            style_profile=student_style,
            session_scores=sess_scores,
            session_dates=sess_dates,
            strengths=strengths,
            areas_to_improve=areas,
            engagement_level=engagement,
            quiz_completed=quiz_completed,
            grade_level=grade_level,
            learning_style_summary=learning_style_summary,
            subjects=subjects,
            resume_uploaded=resume_uploaded,
            lessons_generated=lessons_count_map.get(uid, 0),
            performance_reports=student_perf_reports,
        ))

    # ── Class-level aggregates ────────────────────────────────────────────────
    topic_counts: dict[str, int] = {}
    for t in all_topics:
        topic_counts[t] = topic_counts.get(t, 0) + 1
    common_topics = [t for t, _ in sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)[:10]]

    class_style = None
    if style_count > 0:
        class_style = StyleProfile(**{k: round(class_style_sums[k] / style_count, 3) for k in style_keys})

    high = sum(1 for r in student_reports if r.engagement_level == "high")
    med = sum(1 for r in student_reports if r.engagement_level == "medium")
    low = sum(1 for r in student_reports if r.engagement_level == "low")

    # ── Class demographics ────────────────────────────────────────────────────
    quiz_completed_count = sum(1 for r in student_reports if r.quiz_completed)
    grade_dist: dict[str, int] = {}
    all_subjects: list[str] = []
    for r in student_reports:
        if r.grade_level:
            grade_dist[r.grade_level] = grade_dist.get(r.grade_level, 0) + 1
        all_subjects.extend(r.subjects)

    # Most common subjects
    subj_counts: dict[str, int] = {}
    for s in all_subjects:
        subj_counts[s] = subj_counts.get(s, 0) + 1
    common_subjects = [s for s, _ in sorted(subj_counts.items(), key=lambda x: x[1], reverse=True)[:10]]

    n_students = len(student_reports)
    demographics = ClassDemographics(
        total_students=n_students,
        quiz_completion_rate=round(quiz_completed_count / n_students, 2) if n_students > 0 else 0.0,
        grade_distribution=grade_dist,
        common_subjects=common_subjects,
        avg_lessons_per_student=round(total_lessons / n_students, 1) if n_students > 0 else 0.0,
        total_lessons_generated=total_lessons,
        total_performance_reports=total_reports,
        avg_report_score=round(sum(all_report_scores) / len(all_report_scores), 1) if all_report_scores else 0.0,
    )

    return ClassroomAnalytics(
        course_id=course_id,
        total_sessions=len(sessions),
        avg_teaching_score=round(sum(all_scores) / len(all_scores), 1) if all_scores else 0.0,
        active_students=len(student_sessions),
        common_topics=common_topics,
        score_distribution=score_dist,
        avg_messages_per_session=round(total_messages / len(sessions), 1) if sessions else 0.0,
        total_messages=total_messages,
        high_engagement_count=high,
        medium_engagement_count=med,
        low_engagement_count=low,
        class_style_profile=class_style,
        student_reports=sorted(student_reports, key=lambda r: r.avg_teaching_score, reverse=True),
        class_demographics=demographics,
    )


# ── Performance Report ─────────────────────────────────────────────────────────

@router.post("/sessions/{session_id}/report", response_model=PerformanceReportResponse)
async def generate_performance_report(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a comprehensive performance report for a teaching session."""
    from app.models.performance_report import PerformanceReport

    session = db.query(ClassroomSession).filter(ClassroomSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check if report already exists
    existing_report = db.query(PerformanceReport).filter(
        PerformanceReport.session_id == session_id
    ).first()
    if existing_report:
        return _report_to_response(existing_report)

    messages = json.loads(session.messages) if session.messages else []
    style = json.loads(session.style_profile) if session.style_profile else {}
    topics = json.loads(session.topics_covered) if session.topics_covered else []

    conversation_text = "\n".join(
        f"{'Teacher' if m.get('role') == 'user' else m.get('agent_name', 'Student')}: {m.get('content', '')}"
        for m in messages
    )

    from app.services.ai_client import chat

    try:
        raw = await chat(
            system=(
                "You are an expert educational evaluator analyzing a student's teaching session. "
                "Generate a comprehensive performance report as JSON with these fields:\n"
                '{"strengths": ["..."], "weaknesses": ["..."], '
                '"topics_strong": ["..."], "topics_weak": ["..."], '
                '"full_report": "2-3 paragraph summary of performance and recommendations"}'
            ),
            messages=[{
                "role": "user",
                "content": (
                    f"Teaching score: {session.teaching_score}/100\n"
                    f"Style profile: {json.dumps(style)}\n"
                    f"Topics covered: {json.dumps(topics)}\n\n"
                    f"Full conversation:\n{conversation_text[:3000]}"
                ),
            }],
            max_tokens=600,
            temperature=0.3,
        )

        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
        result = json.loads(text)
    except Exception:
        result = {
            "strengths": ["Completed a teaching session"],
            "weaknesses": ["Continue developing explanations"],
            "topics_strong": topics[:3] if topics else [],
            "topics_weak": [],
            "full_report": f"Teaching session completed with score {session.teaching_score}/100.",
        }

    report = PerformanceReport(
        id=str(uuid.uuid4()),
        session_id=session.id,
        user_id=current_user.id,
        course_id=session.course_id,
        lesson_id=session.lesson_id,
        teaching_score=session.teaching_score,
        strengths=json.dumps(result.get("strengths", [])),
        weaknesses=json.dumps(result.get("weaknesses", [])),
        topics_strong=json.dumps(result.get("topics_strong", [])),
        topics_weak=json.dumps(result.get("topics_weak", [])),
        style_profile=json.dumps(style),
        full_report_text=result.get("full_report", ""),
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    # Index report into personal RAG for future context
    try:
        from app.services.personal_rag import index_performance_report
        index_performance_report(current_user.id, report.full_report_text, session.id)
        report.indexed_in_rag = True
        db.commit()
    except Exception:
        pass

    return _report_to_response(report)


def _report_to_response(report) -> PerformanceReportResponse:
    return PerformanceReportResponse(
        id=report.id,
        session_id=report.session_id,
        user_id=report.user_id,
        course_id=report.course_id,
        lesson_id=report.lesson_id,
        teaching_score=report.teaching_score,
        strengths=json.loads(report.strengths) if report.strengths else [],
        weaknesses=json.loads(report.weaknesses) if report.weaknesses else [],
        topics_strong=json.loads(report.topics_strong) if report.topics_strong else [],
        topics_weak=json.loads(report.topics_weak) if report.topics_weak else [],
        full_report_text=report.full_report_text or "",
        created_at=report.created_at.isoformat(),
    )


@router.post("/sessions/{session_id}/generate-followup")
async def generate_followup_lesson(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Generate a follow-up lesson targeting weak areas from a performance report."""
    from app.models.performance_report import PerformanceReport
    from app.models.generated_lesson import GeneratedLesson

    report = db.query(PerformanceReport).filter(
        PerformanceReport.session_id == session_id,
        PerformanceReport.user_id == current_user.id,
    ).first()

    if not report:
        raise HTTPException(status_code=404, detail="No performance report found. Generate a report first.")

    weak_topics = json.loads(report.topics_weak) if report.topics_weak else []
    weaknesses = json.loads(report.weaknesses) if report.weaknesses else []

    if not weak_topics and not weaknesses:
        raise HTTPException(status_code=400, detail="No weak areas identified to practice.")

    # Create a new lesson focused on weak areas
    import asyncio
    lesson_id = str(uuid.uuid4())

    lesson = GeneratedLesson(
        id=lesson_id,
        course_id=report.course_id,
        user_id=current_user.id,
        topic=f"Review: {', '.join(weak_topics[:3])}" if weak_topics else "Review Session",
        status="generating",
    )
    db.add(lesson)
    db.commit()

    # Build focused input for the lesson engine
    course = db.query(Course).filter(Course.id == report.course_id).first()
    course_title = course.title if course else "Course"

    raw_input = (
        f"Create a focused review lesson for the course '{course_title}'.\n\n"
        f"The student needs to strengthen these topics: {', '.join(weak_topics)}\n"
        f"Areas for improvement: {', '.join(weaknesses)}\n\n"
        f"Previous teaching score: {report.teaching_score}/100\n"
        f"Focus on building understanding in the weak areas with extra examples and exercises."
    )

    from app.routers.lessons import _sse_queues, _run_lesson_pipeline
    _sse_queues[lesson_id] = asyncio.Queue()

    asyncio.create_task(
        _run_lesson_pipeline(lesson_id, course, current_user, "")
    )

    return {"lesson_id": lesson_id, "status": "generating", "focus_topics": weak_topics}
