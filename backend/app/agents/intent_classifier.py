"""PydanticAI intent classifier used before chat routing."""

from __future__ import annotations

from pydantic_ai import Agent, PromptedOutput

from ..domain.intent.models import AIIntentResult
from ..infrastructure.deepseek import build_deepseek_model


SYSTEM_PROMPT = """
You are the intent router for HumanOS. Classify every Chinese or English user
message before any task parsing or side effect.

Distinguish carefully:
- add_task: explicitly create new future work.
- reschedule: change an existing task, event, deadline, duration, or time.
- progress_update: report work already performed; never create a new task.
- interruption: pause, resume, stop, or switch the current execution.
- report_state: report energy, focus, stress, mood, or availability.
- query_calendar / summarize_schedule: read-only calendar questions.
- delete_task: remove an existing task; this always requires confirmation.
- update_profile: change availability, focus length, rest length, or preferences.
- general_advice: advice or explanation without changing stored data.
- other: none of the above.

Rules:
- Classify from meaning, not isolated keywords.
- "Finish X by Friday" is add_task; "I finished X" is progress_update.
- "Move X to Friday" is reschedule, not add_task.
- Extract textual references to existing tasks without inventing database IDs.
- If a write targets an ambiguous task, requires_clarification must be true.
- Read-only requests must set read_only=true.
- Return a short reason in the user's language.
""".strip()


class PydanticAIIntentClassifier:
    def classify(self, text: str, *, current_time: str, timezone_name: str, chat_context: dict | None = None) -> AIIntentResult | None:
        model = build_deepseek_model()
        if model is None:
            return None
        agent = Agent(model, output_type=PromptedOutput(AIIntentResult), system_prompt=SYSTEM_PROMPT)
        prompt = (
            f"Current time: {current_time}\nTimezone: {timezone_name}\n"
            f"Recent context and candidate tasks: {chat_context or {}}\n"
            f"User input:\n{text}"
        )
        try:
            return agent.run_sync(prompt).output
        except Exception as error:
            print(f"PydanticAI intent classifier fallback: {type(error).__name__}: {error}", flush=True)
            return None
