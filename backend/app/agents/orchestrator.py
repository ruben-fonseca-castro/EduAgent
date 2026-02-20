"""
Lightweight LangGraph-style agent orchestrator.

Graph: Router → [Agents in parallel] → Critic → Summarizer (optional)

Uses the unified ai_client, which prefers Oracle OCI GenAI and falls back
to Anthropic or stub responses.
"""

import asyncio

from app.agents.personas import PERSONAS, get_persona
from app.agents.critic import critique_responses
from app.agents.summarizer import summarize_session
from app.services.ai_client import chat


class AgentOrchestrator:
    """Lightweight graph-based agent orchestrator."""

    def _route(self, student_text: str) -> list[str]:
        """Router node: pick which agent personas respond based on the query."""
        text_lower = student_text.lower()
        agents = ["friendly_tutor"]  # always include

        if any(w in text_lower for w in ["why", "how", "because", "i think", "i believe", "isn't it"]):
            agents.append("socratic_examiner")

        if any(w in text_lower for w in ["always", "never", "definitely", "obviously", "everyone knows"]):
            agents.append("skeptic")

        if any(w in text_lower for w in ["study", "prepare", "practice", "exam", "quiz", "test", "how to", "what should"]):
            agents.append("practical_coach")

        if any(w in text_lower for w in ["grade", "rubric", "assessment", "points", "score", "mark"]):
            agents.append("teacher_proxy")

        if len(agents) == 1:
            agents.append("socratic_examiner")

        return agents[:3]  # cap at 3 per response

    async def _call_agent(
        self,
        persona_key: str,
        student_text: str,
        conversation_history: list[dict],
        market_context: str,
    ) -> dict:
        """Call a single agent persona through the unified AI client."""
        persona = get_persona(persona_key)

        system_prompt = (
            f"{persona['system_prompt']}\n\n"
            f"Context: The student is studying the following topic: {market_context}\n"
            f"Respond in character as {persona['name']}. Keep it concise and educational."
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
                max_tokens=300,
                temperature=0.7,
            )
            return {
                "agent_name": persona["name"],
                "persona": persona_key,
                "message": reply,
            }
        except Exception as e:
            return {
                "agent_name": persona["name"],
                "persona": persona_key,
                "message": f"[{persona['name']}]: Unable to respond — {e}",
            }

    async def process_message(
        self,
        student_text: str,
        conversation_history: list[dict],
        market_context: str,
        generate_summary: bool = False,
    ) -> dict:
        """Process a student message through the agent graph."""
        # Step 1: Route
        selected_agents = self._route(student_text)

        # Step 2: Call selected agents in parallel
        tasks = [
            self._call_agent(key, student_text, conversation_history, market_context)
            for key in selected_agents
        ]
        agent_responses = list(await asyncio.gather(*tasks))

        # Step 3: Critic (safety/content check)
        critic_result = critique_responses(agent_responses, student_text)

        if not critic_result["approved"]:
            from app.services.moderation import check_content
            safe = [r for r in agent_responses if check_content(r["message"])["safe"]]
            agent_responses = safe or [{
                "agent_name": "System",
                "persona": "system",
                "message": "Some responses were filtered for safety. Please rephrase your question.",
            }]

        result: dict = {
            "agent_responses": agent_responses,
            "critic_result": critic_result,
        }

        # Step 4: Optional summarizer
        if generate_summary:
            all_msgs = conversation_history + [
                {"role": "user", "content": student_text},
            ] + [
                {"role": "assistant", "content": r["message"], "agent_name": r["agent_name"]}
                for r in agent_responses
            ]
            result["summary"] = await summarize_session(all_msgs, market_context)

        return result


# Singleton instance
orchestrator = AgentOrchestrator()
