"""
Classroom orchestrator for the Learn-by-Teaching paradigm.

The student teaches AI learners. The orchestrator:
1. Retrieves relevant course material (RAG)
2. Routes to appropriate AI learner personas
3. Evaluates teaching quality
4. Tracks student's teaching style
"""

import asyncio
import json

from app.agents.classroom_personas import CLASSROOM_PERSONAS, get_classroom_persona
from app.services.ai_client import chat


class ClassroomOrchestrator:
    """Orchestrates the Learn-by-Teaching classroom experience."""

    def _route(self, student_text: str, turn_count: int) -> list[str]:
        """Pick which AI agents respond to this teaching turn.

        All 5 agents always respond so students see the full classroom.
        """
        # Always return all 5 personas — every agent contributes a unique perspective
        return [
            "socratic_examiner",
            "friendly_tutor",
            "skeptic",
            "practical_coach",
            "teacher_proxy",
        ]

    def _determine_avatar_state(self, persona_key: str, response_text: str) -> str:
        """Determine what animation state the avatar should show."""
        text_lower = response_text.lower()

        if persona_key == "socratic_examiner":
            if "?" in response_text:
                return "hand_raised"
            if any(w in text_lower for w in ["why", "how do you know", "what assumptions"]):
                return "thinking"
            return "idle"

        if persona_key == "friendly_tutor":
            if any(w in text_lower for w in ["great", "right track", "well done", "good job"]):
                return "enlightened"
            if any(w in text_lower for w in ["not quite", "actually", "careful", "let me correct"]):
                return "thinking"
            return "nodding"

        if persona_key == "skeptic":
            if "?" in response_text:
                return "hand_raised"
            if any(w in text_lower for w in ["but what about", "consider", "however", "not always"]):
                return "thinking"
            return "idle"

        if persona_key == "practical_coach":
            if any(w in text_lower for w in ["try", "exercise", "next step", "practice", "do this"]):
                return "nodding"
            return "thinking"

        if persona_key == "teacher_proxy":
            if any(w in text_lower for w in ["nice", "good", "well done", "great"]):
                return "nodding"
            return "idle"

        return "idle"

    async def _call_learner(
        self,
        persona_key: str,
        student_text: str,
        conversation_history: list[dict],
        rag_context: str,
        course_title: str,
        personal_context: str = "",
        lesson_context: str = "",
    ) -> dict:
        """Call a single AI learner persona."""
        persona = get_classroom_persona(persona_key)

        system_prompt = (
            f"{persona['system_prompt']}\n\n"
            f"Course: {course_title}\n"
        )

        if rag_context and persona_key == "teacher_proxy":
            system_prompt += (
                f"\nSource Material (use this to evaluate teaching accuracy):\n"
                f"{rag_context}\n"
            )
        elif rag_context:
            system_prompt += (
                f"\nNote: The correct information from the course materials is:\n"
                f"{rag_context}\n"
                f"Use this to react appropriately — if the teacher is wrong, "
                f"show confusion. If correct, show understanding.\n"
            )

        # Inject personal context (student profile, learning style, past reports)
        if personal_context:
            system_prompt += (
                f"\n--- STUDENT PROFILE & STYLE RULES ---\n"
                f"{personal_context}\n"
                f"IMPORTANT: Any MANDATORY STYLE INSTRUCTIONS listed above are hard requirements. "
                f"You MUST apply them in every single response without exception. "
                f"For example, if the student requests a specific accent, speaking style, or tone, "
                f"you must use it throughout your entire response.\n"
                f"--- END STUDENT PROFILE ---\n"
            )

        # Inject lesson context if the student just read a generated lesson
        if lesson_context:
            system_prompt += (
                f"\nLesson Content the student just studied (ask questions about this):\n"
                f"{lesson_context[:2000]}\n"
            )

        # Build conversation history (last 10 turns)
        messages = []
        for msg in conversation_history[-10:]:
            role = "user" if msg.get("role") == "user" else "assistant"
            messages.append({"role": role, "content": msg.get("content", "")})
        messages.append({"role": "user", "content": student_text})

        try:
            reply = await chat(
                system=system_prompt,
                messages=messages,
                max_tokens=200,
                temperature=0.8,
            )
            avatar_state = self._determine_avatar_state(persona_key, reply)
            return {
                "agent_name": persona["name"],
                "persona": persona_key,
                "message": reply,
                "avatar_state": {"animation": avatar_state},
            }
        except Exception as e:
            return {
                "agent_name": persona["name"],
                "persona": persona_key,
                "message": f"[{persona['name']} is thinking...]",
                "avatar_state": {"animation": "thinking"},
            }

    async def _evaluate_teaching(
        self,
        student_text: str,
        conversation_history: list[dict],
        rag_context: str,
        current_score: float,
        current_style: dict | None,
    ) -> dict:
        """Evaluate teaching quality and update style profile."""
        conversation_text = "\n".join(
            f"{'Teacher' if m.get('role') == 'user' else m.get('agent_name', 'Student')}: {m.get('content', '')}"
            for m in (conversation_history[-6:] + [{"role": "user", "content": student_text}])
        )

        eval_prompt = (
            "You are evaluating a student who is TEACHING AI learners. "
            "Based on their latest teaching, score and analyze their style.\n\n"
            f"Previous score: {current_score}/100\n"
            f"Current style profile: {json.dumps(current_style or {})}\n\n"
            f"Source material context:\n{rag_context[:500] if rag_context else 'N/A'}\n\n"
            f"Recent conversation:\n{conversation_text}\n\n"
            "Return ONLY valid JSON:\n"
            '{"score": <0-100>, "delta": <-10 to +10 change>, '
            '"style": {"uses_analogies": <0-1>, "uses_examples": <0-1>, '
            '"breaks_down_steps": <0-1>, "checks_understanding": <0-1>, '
            '"accuracy": <0-1>}, '
            '"feedback": "<one sentence of constructive feedback>"}'
        )

        try:
            raw = await chat(
                system="You are a teaching evaluation assistant. Return only JSON.",
                messages=[{"role": "user", "content": eval_prompt}],
                max_tokens=300,
                temperature=0.3,
            )
            text = raw.strip()
            if text.startswith("```"):
                lines = text.split("\n")
                text = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

            result = json.loads(text)
            new_score = max(0, min(100, current_score + result.get("delta", 0)))
            return {
                "score": new_score,
                "style": result.get("style", current_style or {}),
                "feedback": result.get("feedback", ""),
            }
        except Exception:
            return {
                "score": min(100, current_score + 2),
                "style": current_style or {},
                "feedback": "",
            }

    async def _blend_responses(self, responses: list[dict]) -> dict:
        """Blend multiple persona responses into one seamless voice.

        When the student selects 2+ personas, this synthesises all their
        individual takes into a single, naturally-flowing reply with no
        speaker labels — so TTS can read it cleanly as one voice.
        """
        # Pull out the supervisor feedback separately so it stays in its own channel
        non_supervisor = [r for r in responses if r["persona"] != "teacher_proxy"]
        supervisor = next((r for r in responses if r["persona"] == "teacher_proxy"), None)

        if not non_supervisor:
            # Edge case: only teacher_proxy selected
            return responses[0] if responses else {
                "agent_name": "Class", "persona": "mixed",
                "message": "", "avatar_state": {"animation": "idle"},
            }

        if len(non_supervisor) == 1:
            # Only one non-supervisor perspective — return it directly, no blend needed
            resp = non_supervisor[0]
            # But still attach supervisor feedback as a note if present
            return resp

        inputs = "\n".join(f"- {r['agent_name']}: {r['message']}" for r in non_supervisor)
        blend_prompt = (
            f"A student just finished explaining something. "
            f"Here are reactions from different AI classroom personas:\n{inputs}\n\n"
            "Synthesise these into ONE cohesive 1-3 sentence response that "
            "captures the most useful insights from each perspective. "
            "Rules: NO speaker labels, NO names, NO headers, NO markdown bold. "
            "Write as a single natural voice, conversational and direct. "
            "If there's a question, ask only one."
        )
        try:
            reply = await chat(
                system=(
                    "You are a classroom AI. Blend multiple teaching perspectives "
                    "into one seamless, natural response. Return plain prose only — "
                    "no bold, no labels, no headers."
                ),
                messages=[{"role": "user", "content": blend_prompt}],
                max_tokens=180,
                temperature=0.7,
            )
            # Strip any accidental bold markers the model might add
            reply = reply.replace("**", "").replace("__", "").strip()
        except Exception:
            # Fallback: just use the first non-supervisor response
            reply = non_supervisor[0]["message"]

        return {
            "agent_name": "Class",
            "persona": "mixed",
            "message": reply,
            "avatar_state": {"animation": "nodding"},
        }

    async def process_message(
        self,
        student_text: str,
        conversation_history: list[dict],
        rag_context: str,
        course_title: str,
        current_score: float = 0.0,
        current_style: dict | None = None,
        requested_personas: list[str] | None = None,
        personal_context: str = "",
        lesson_context: str = "",
    ) -> dict:
        """Process a student's teaching message through the classroom."""
        turn_count = len([m for m in conversation_history if m.get("role") == "user"])

        # Step 1: Route to AI learners — honour frontend persona selection
        if requested_personas and len(requested_personas) > 0:
            valid = ["socratic_examiner", "friendly_tutor", "skeptic", "practical_coach", "teacher_proxy"]
            selected_agents = [p for p in requested_personas if p in valid] or self._route(student_text, turn_count)
        else:
            selected_agents = self._route(student_text, turn_count)

        # Step 2: Call selected agents in parallel
        tasks = [
            self._call_learner(
                key, student_text, conversation_history, rag_context, course_title,
                personal_context=personal_context, lesson_context=lesson_context,
            )
            for key in selected_agents
        ]

        # Also evaluate teaching in parallel
        eval_task = self._evaluate_teaching(
            student_text, conversation_history, rag_context, current_score, current_style,
        )

        all_results = await asyncio.gather(*tasks, eval_task)
        agent_responses = list(all_results[:-1])
        eval_result = all_results[-1]

        # Extract teacher_proxy feedback for the supervisor channel (always)
        supervisor_feedback = None
        for resp in agent_responses:
            if resp["persona"] == "teacher_proxy":
                supervisor_feedback = resp["message"]

        # Step 3: Blend multiple responses into ONE when 2+ personas were requested.
        # Single-persona responses pass through untouched.
        if len(agent_responses) > 1:
            blended = await self._blend_responses(agent_responses)
            final_responses = [blended]
        else:
            final_responses = agent_responses

        return {
            "agent_responses": final_responses,
            "teaching_score": eval_result["score"],
            "style_profile": eval_result["style"],
            "supervisor_feedback": supervisor_feedback or eval_result.get("feedback", ""),
        }


# Singleton
classroom_orchestrator = ClassroomOrchestrator()
