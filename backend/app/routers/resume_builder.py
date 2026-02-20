"""Resume Builder API — AI-powered resume editing integrated into numénor.ai.

Replaces the standalone Express+MCP resume-builder with FastAPI endpoints
that use OCI GenAI (or Anthropic fallback) and store state per-user in the DB.
"""

import json
import uuid
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.student_profile import StudentProfile
from app.models.resume_state import ResumeBuilderState
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/resume-builder", tags=["resume-builder"])

# ── Helpers ───────────────────────────────────────────────────────────────────

def require_student(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Students only")
    return current_user


def _get_or_create_state(db: Session, user_id: str) -> ResumeBuilderState:
    state = db.query(ResumeBuilderState).filter(
        ResumeBuilderState.user_id == user_id
    ).first()
    if not state:
        state = ResumeBuilderState(user_id=user_id, resume_json=None, suggestions_json="[]", chat_history="[]")
        db.add(state)
        db.commit()
        db.refresh(state)
    return state


def _get_resume_dict(state: ResumeBuilderState) -> dict:
    if state.resume_json:
        return json.loads(state.resume_json)
    return {
        "basics": {"name": "", "email": "", "phone": "", "linkedin": "", "github": ""},
        "education": [],
        "experience": [],
        "projects": [],
        "skills": {"languages": [], "frameworks": [], "tools": [], "softSkills": []},
    }


def _get_suggestions(state: ResumeBuilderState) -> list:
    if state.suggestions_json:
        return json.loads(state.suggestions_json)
    return []


def _get_chat_history(state: ResumeBuilderState) -> list:
    if state.chat_history:
        return json.loads(state.chat_history)
    return []


def _save_state(db: Session, state: ResumeBuilderState,
                resume: dict | None = None,
                suggestions: list | None = None,
                chat_history: list | None = None):
    if resume is not None:
        state.resume_json = json.dumps(resume)
    if suggestions is not None:
        state.suggestions_json = json.dumps(suggestions)
    if chat_history is not None:
        state.chat_history = json.dumps(chat_history)
    db.commit()


def _recursive_replace(obj, original: str, proposed: str):
    """Recursively find-and-replace a string in a nested dict/list structure."""
    if isinstance(obj, str):
        return proposed if obj.strip() == original.strip() else obj
    if isinstance(obj, list):
        return [_recursive_replace(item, original, proposed) for item in obj]
    if isinstance(obj, dict):
        return {k: _recursive_replace(v, original, proposed) for k, v in obj.items()}
    return obj


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str
    mode: Optional[str] = None

class SuggestionActionResponse(BaseModel):
    success: bool

# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/resume")
def get_resume(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Get the user's current resume state."""
    state = _get_or_create_state(db, current_user.id)
    resume = _get_resume_dict(state)

    # If resume is empty and user uploaded one during onboarding, seed from that
    if not resume.get("basics", {}).get("name"):
        profile = db.query(StudentProfile).filter(
            StudentProfile.user_id == current_user.id
        ).first()
        if profile and profile.resume_text:
            # We have raw text — return empty structured resume but flag that text exists
            resume["_has_uploaded_text"] = True

    return resume


@router.get("/suggestions")
def get_suggestions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    state = _get_or_create_state(db, current_user.id)
    suggestions = _get_suggestions(state)
    return [s for s in suggestions if s.get("originalText") and s.get("proposedText")]


@router.get("/chat-history")
def get_chat_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    state = _get_or_create_state(db, current_user.id)
    return _get_chat_history(state)


@router.put("/resume/{section}")
async def update_resume_section(
    section: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Update a specific section of the resume (inline edit from UI)."""
    if section not in ("basics", "education", "experience", "projects", "skills"):
        raise HTTPException(status_code=400, detail=f"Invalid section: {section}")

    try:
        content = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    state = _get_or_create_state(db, current_user.id)
    resume = _get_resume_dict(state)
    resume[section] = content
    _save_state(db, state, resume=resume)
    return {"success": True}


@router.post("/suggestions/{suggestion_id}/approve")
def approve_suggestion(
    suggestion_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    state = _get_or_create_state(db, current_user.id)
    suggestions = _get_suggestions(state)
    resume = _get_resume_dict(state)

    idx = next((i for i, s in enumerate(suggestions) if s["id"] == suggestion_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    suggestion = suggestions[idx]
    resume = _recursive_replace(resume, suggestion["originalText"], suggestion["proposedText"])
    suggestions.pop(idx)
    _save_state(db, state, resume=resume, suggestions=suggestions)
    return {"success": True}


@router.post("/suggestions/{suggestion_id}/reject")
def reject_suggestion(
    suggestion_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    state = _get_or_create_state(db, current_user.id)
    suggestions = _get_suggestions(state)
    suggestions = [s for s in suggestions if s["id"] != suggestion_id]
    _save_state(db, state, suggestions=suggestions)
    return {"success": True}


@router.post("/suggestions/approve-all")
def approve_all_suggestions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    state = _get_or_create_state(db, current_user.id)
    suggestions = _get_suggestions(state)
    resume = _get_resume_dict(state)

    for s in suggestions:
        if s.get("originalText") and s.get("proposedText"):
            resume = _recursive_replace(resume, s["originalText"], s["proposedText"])

    _save_state(db, state, resume=resume, suggestions=[])
    return {"success": True}


@router.post("/suggestions/reject-all")
def reject_all_suggestions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    state = _get_or_create_state(db, current_user.id)
    _save_state(db, state, suggestions=[])
    return {"success": True}


@router.post("/reset")
def reset_resume(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Reset the resume builder — clears resume data, suggestions, and chat history."""
    state = _get_or_create_state(db, current_user.id)
    empty_resume = {
        "basics": {"name": "", "email": "", "phone": "", "linkedin": "", "github": ""},
        "education": [],
        "experience": [],
        "projects": [],
        "skills": {"languages": [], "frameworks": [], "tools": [], "softSkills": []},
    }
    welcome_chat = [
        {"role": "agent", "content": "Hello! I'm your AI Resume Builder. Upload your resume or ask me to help build one from scratch. I can also tailor it for specific job descriptions."}
    ]
    _save_state(db, state, resume=empty_resume, suggestions=[], chat_history=welcome_chat)
    return {"success": True}


@router.post("/upload")
async def upload_resume_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Upload a PDF/DOCX/TXT resume — saves to personal RAG, then AI parses into structured form.

    Flow:
      1. Save file to disk (same location as onboarding upload)
      2. Extract text using pypdf / python-docx (from disk, not BytesIO)
      3. Store extracted text in StudentProfile.resume_text
      4. Index into ChromaDB via personal_rag.index_resume()
      5. Feed the clean text to the AI for structured JSON parsing
    """
    from pathlib import Path
    from app.config import settings

    content = await file.read()
    filename = file.filename or "resume.txt"

    # ── 1. Save file to disk ─────────────────────────────────────────────────
    upload_dir = Path(settings.STUDENT_CONTEXT_DIR) / current_user.id
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / filename
    with open(file_path, "wb") as f:
        f.write(content)

    # ── 2. Extract text from saved file ──────────────────────────────────────
    text = ""
    if filename.lower().endswith(".pdf"):
        try:
            import pdfplumber
            with pdfplumber.open(str(file_path)) as pdf:
                pages_text = []
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        pages_text.append(page_text)
                text = "\n".join(pages_text)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"PDF extraction failed: {e}")
            text = ""
    elif filename.lower().endswith((".docx", ".doc")):
        try:
            import docx
            doc = docx.Document(str(file_path))
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except Exception:
            text = ""
    else:
        text = content.decode("utf-8", errors="ignore")

    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from file. Make sure the PDF is not scanned/image-based.")

    # ── 3. Save extracted text into StudentProfile ───────────────────────────
    profile = db.query(StudentProfile).filter(
        StudentProfile.user_id == current_user.id
    ).first()
    if profile:
        profile.resume_text = text
        profile.resume_path = str(file_path)
    else:
        # Create a minimal profile if one doesn't exist yet
        profile = StudentProfile(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            resume_text=text,
            resume_path=str(file_path),
        )
        db.add(profile)
    db.commit()

    # ── 4. Index into personal ChromaDB (RAG) ────────────────────────────────
    try:
        from app.services.personal_rag import index_resume
        index_resume(current_user.id, text)
        profile.chroma_indexed = True
        db.commit()
    except Exception:
        pass  # RAG indexing is best-effort

    # ── 5. Feed clean text to AI for structured JSON parsing ─────────────────
    message = f"""I have uploaded a new resume. Please extract ALL the details and produce a structured JSON resume.

Here is the parsed text:

{text}"""

    state = _get_or_create_state(db, current_user.id)
    chat_history = _get_chat_history(state)

    reply, mode, new_resume, new_suggestions = await _run_resume_agent(
        message, chat_history, _get_resume_dict(state), _get_suggestions(state), is_upload=True
    )

    chat_history.append({"role": "user", "content": f"[Uploaded File: {filename}]"})
    chat_history.append({"role": "agent", "content": reply})

    if new_resume:
        _save_state(db, state, resume=new_resume, suggestions=new_suggestions, chat_history=chat_history)
    else:
        _save_state(db, state, suggestions=new_suggestions, chat_history=chat_history)

    return {"reply": reply, "mode": mode}


@router.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Send a message to the resume builder AI agent."""
    state = _get_or_create_state(db, current_user.id)
    resume = _get_resume_dict(state)
    suggestions = _get_suggestions(state)
    chat_history = _get_chat_history(state)

    reply, mode, new_resume, new_suggestions = await _run_resume_agent(
        req.message, chat_history, resume, suggestions
    )

    chat_history.append({"role": "user", "content": req.message})
    chat_history.append({"role": "agent", "content": reply})

    # Keep last 40 messages to prevent DB bloat
    if len(chat_history) > 40:
        chat_history = chat_history[-40:]

    if new_resume:
        _save_state(db, state, resume=new_resume, suggestions=new_suggestions, chat_history=chat_history)
    else:
        _save_state(db, state, suggestions=new_suggestions, chat_history=chat_history)

    return ChatResponse(reply=reply, mode=mode)


@router.post("/seed-from-upload")
async def seed_from_uploaded_resume(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Seed the resume builder from the resume uploaded during onboarding."""
    profile = db.query(StudentProfile).filter(
        StudentProfile.user_id == current_user.id
    ).first()

    if not profile or not profile.resume_text:
        raise HTTPException(status_code=404, detail="No uploaded resume found")

    # Ensure the resume text is indexed in ChromaDB if not already
    if not profile.chroma_indexed:
        try:
            from app.services.personal_rag import index_resume
            index_resume(current_user.id, profile.resume_text)
            profile.chroma_indexed = True
            db.commit()
        except Exception:
            pass

    state = _get_or_create_state(db, current_user.id)

    # Check if already has meaningful data
    existing = _get_resume_dict(state)
    if existing.get("basics", {}).get("name"):
        return {"status": "already_seeded", "reply": ""}

    message = f"""I have uploaded a new resume. Please extract ALL the details and produce a structured JSON resume.

Here is the parsed text:

{profile.resume_text}"""

    reply, mode, new_resume, new_suggestions = await _run_resume_agent(
        message, [], existing, [], is_upload=True
    )

    chat_history = [
        {"role": "user", "content": "[Imported resume from onboarding upload]"},
        {"role": "agent", "content": reply},
    ]

    if new_resume:
        _save_state(db, state, resume=new_resume, suggestions=new_suggestions, chat_history=chat_history)
    else:
        _save_state(db, state, chat_history=chat_history)

    return {"status": "seeded", "reply": reply}


# ── AI Agent ──────────────────────────────────────────────────────────────────

async def _ai_chat(system: str, user_msg: str, temperature: float = 0.7, max_tokens: int = 4000) -> str:
    """Call the AI via the shared OCI GenAI / Anthropic chat() function."""
    from app.services.ai_client import chat as ai_chat
    return await ai_chat(
        system=system,
        messages=[{"role": "user", "content": user_msg}],
        max_tokens=max_tokens,
        temperature=temperature,
    )


async def _run_resume_agent(
    user_message: str,
    history: list,
    current_resume: dict,
    current_suggestions: list,
    is_upload: bool = False,
) -> tuple[str, str, dict | None, list]:
    """Run the resume builder AI agent.

    Returns (reply_text, mode, updated_resume_or_None, updated_suggestions).
    """
    # Step 1: Route — is this an edit or analysis?
    if is_upload:
        mode = "edit"
    else:
        mode = await _route_intent(user_message)

    # Step 2: Run the appropriate agent
    if mode == "edit":
        reply, updated_resume, updated_suggestions = await _edit_agent(
            user_message, history, current_resume, current_suggestions, is_upload
        )
    else:
        reply = await _analysis_agent(user_message, history, current_resume)
        updated_resume = None
        updated_suggestions = current_suggestions

    return reply, mode, updated_resume, updated_suggestions


async def _route_intent(user_message: str) -> str:
    """Classify user intent as 'edit' or 'analysis'."""
    system = (
        'You are a router. Determine if the user\'s request is an "Edit" or "Analysis" request. '
        'Edit means they want to modify, update, tailor, shorten, or rewrite their resume. '
        'Analysis means they are asking questions, requesting feedback, or just chatting. '
        'Respond with ONLY the word "Edit" or "Analysis".'
    )
    text = await _ai_chat(system, user_message, temperature=0, max_tokens=10)
    return "edit" if "edit" in text.lower() else "analysis"


async def _analysis_agent(user_message: str, history: list, resume: dict) -> str:
    """Read-only analysis — give feedback without modifying the resume."""
    resume_str = json.dumps(resume, indent=2) if resume.get("basics", {}).get("name") else "(No resume data yet)"

    history_text = ""
    for msg in history[-10:]:
        role = "User" if msg["role"] == "user" else "AI"
        history_text += f"{role}: {msg['content']}\n"

    system = (
        "You are an AI Resume Builder in ANALYSIS MODE.\n"
        "Rules:\n"
        "- Do not modify the resume. Only give feedback.\n"
        "- Be concise and constructive. Focus on ATS-friendly improvements.\n"
        "- Use Problem -> Action -> Result structure advice for bullet points."
    )

    user_prompt = f"""Current Resume:
{resume_str}

Recent conversation:
{history_text}

User: {user_message}

Provide helpful feedback:"""

    return await _ai_chat(system, user_prompt, temperature=0.7, max_tokens=2000)


async def _edit_agent(
    user_message: str,
    history: list,
    resume: dict,
    suggestions: list,
    is_upload: bool,
) -> tuple[str, dict | None, list]:
    """Edit agent — can modify the resume and propose suggestions.

    Returns (reply, updated_resume_or_None, updated_suggestions).
    """
    resume_str = json.dumps(resume, indent=2)

    history_text = ""
    for msg in history[-10:]:
        role = "User" if msg["role"] == "user" else "AI"
        history_text += f"{role}: {msg['content']}\n"

    if is_upload:
        system = (
            "You are an AI Resume Builder. Parse the uploaded resume text into structured JSON.\n"
            "Respond ONLY with a JSON block in ```json ... ``` fences followed by a one-sentence acknowledgment.\n"
            "Keep your response concise — no extra commentary beyond the JSON and one sentence."
        )
        # Truncate very long resume text to avoid OCI timeouts
        resume_text = user_message
        if len(resume_text) > 8000:
            resume_text = resume_text[:8000] + "\n[... truncated for processing]"

        user_prompt = f"""Extract ALL details from this resume into JSON with this exact structure:
```
{{"basics": {{"name":"","email":"","phone":"","linkedin":"","github":""}}, "education": [{{"degree":"","institution":"","date":"","gpa":""}}], "experience": [{{"title":"","company":"","location":"","date":"","bullets":[""]}}], "projects": [{{"name":"","techStack":"","bullets":[""]}}], "skills": {{"languages":[],"frameworks":[],"tools":[],"softSkills":[]}}}}
```

Resume text:
{resume_text}"""
    else:
        system = (
            "You are an AI Resume Builder in EDIT MODE.\n"
            "Rules:\n"
            "- When the user asks to tailor or improve, propose changes using SUGGESTION blocks.\n"
            "- Format each suggestion as:\n"
            "  <<<SUGGESTION>>>\n"
            "  ORIGINAL: [exact text from resume]\n"
            "  PROPOSED: [improved text]\n"
            "  EXPLANATION: [why this is better]\n"
            "  <<<END_SUGGESTION>>>\n"
            "- If the user asks to completely rewrite a section or replace the entire resume, output the new JSON in ```json ... ``` code fences.\n"
            "- ONLY use JSON replacement for structural changes (adding/removing entries, updating fields). For bullet rewrites, use SUGGESTION blocks.\n"
            "- Keep bullets concise (<130 chars), use Problem->Action->Result structure.\n"
            "- A4 page fits ~3 experiences with 2-3 bullets each, 2 projects with 2 bullets.\n"
            "- Be concise in your conversational response."
        )
        user_prompt = f"""Current Resume:
{resume_str}

Recent conversation:
{history_text}

User: {user_message}

Respond with your suggestions and/or edits:"""

    # Upload needs less tokens (just JSON), edit/suggestions need more
    tokens = 2500 if is_upload else 4000
    text = await _ai_chat(system, user_prompt, temperature=0.2, max_tokens=tokens)

    # Parse out any JSON resume update
    updated_resume = None
    json_match = re.search(r'```json\s*(.*?)\s*```', text, re.DOTALL)
    if json_match:
        try:
            parsed = json.loads(json_match.group(1))
            # Validate it has the right structure
            if isinstance(parsed, dict) and "basics" in parsed:
                updated_resume = parsed
                # Ensure all required fields exist
                defaults = {
                    "basics": {"name": "", "email": "", "phone": "", "linkedin": "", "github": ""},
                    "education": [],
                    "experience": [],
                    "projects": [],
                    "skills": {"languages": [], "frameworks": [], "tools": [], "softSkills": []},
                }
                for key in defaults:
                    if key not in updated_resume:
                        updated_resume[key] = defaults[key]
        except json.JSONDecodeError:
            pass

    # Parse out suggestions
    new_suggestions = list(suggestions)  # start with existing
    suggestion_pattern = r'<<<SUGGESTION>>>\s*ORIGINAL:\s*(.*?)\s*PROPOSED:\s*(.*?)\s*EXPLANATION:\s*(.*?)\s*<<<END_SUGGESTION>>>'
    for match in re.finditer(suggestion_pattern, text, re.DOTALL):
        original = match.group(1).strip()
        proposed = match.group(2).strip()
        explanation = match.group(3).strip()
        if original and proposed and original != proposed:
            new_suggestions.append({
                "id": str(uuid.uuid4()),
                "originalText": original,
                "proposedText": proposed,
                "explanation": explanation,
                "status": "pending",
            })

    # Clean the reply — remove JSON blocks and suggestion blocks for display
    reply = text
    reply = re.sub(r'```json\s*.*?\s*```', '', reply, flags=re.DOTALL)
    reply = re.sub(r'<<<SUGGESTION>>>.*?<<<END_SUGGESTION>>>', '', reply, flags=re.DOTALL)
    reply = reply.strip()

    if not reply:
        if updated_resume:
            reply = "I've parsed your resume and loaded it into the builder. You can now edit any field directly, or ask me to tailor it for a specific job."
        elif new_suggestions != suggestions:
            count = len(new_suggestions) - len(suggestions)
            reply = f"I've proposed {count} suggestion{'s' if count != 1 else ''}. Review them on your resume — hover over the blue dots to see each change."

    return reply, updated_resume, new_suggestions
