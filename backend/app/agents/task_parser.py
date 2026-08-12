"""PydanticAI implementation of the task parsing port."""

from __future__ import annotations

from pydantic_ai import Agent, PromptedOutput

from ..domain.task.models import ParsedTaskBatch
from ..infrastructure.deepseek import build_deepseek_model


SYSTEM_PROMPT = """
You are the typed task parser for HumanOS. Extract independent calendar tasks
from Chinese or English input. Return facts only.

Rules:
- Keep every independent task separate and preserve source order.
- A deadline is never a start time.
- Use fixed_event only when the user specifies when the event starts.
- Flexible work uses deadline_at; do not invent start_at.
- Resolve relative dates against the supplied current time and timezone.
- Return ISO-8601 datetimes with timezone offsets when a date and clock exist.
- Do not invent missing duration, deadline, priority, or task details.
- A task must describe an executable action or outcome. Never create a task
  whose title is only a duration, date, time, deadline label, or priority.
- Attach metadata phrases such as "three hours", "due Friday", and
  "high priority" to the task they describe.
- Priority values are exactly 高, 中, or 低.
- Record absent required fields in missing_fields.
""".strip()


class PydanticAITaskParser:
    def parse(
        self,
        text: str,
        *,
        current_time: str,
        timezone_name: str,
        chat_context: dict | None = None,
        validation_feedback: list[str] | None = None,
    ) -> ParsedTaskBatch | None:
        model = build_deepseek_model()
        if model is None:
            return None
        agent = Agent(model, output_type=PromptedOutput(ParsedTaskBatch), system_prompt=SYSTEM_PROMPT)
        prompt = (
            f"Current time: {current_time}\n"
            f"Timezone: {timezone_name}\n"
            f"Recent context: {chat_context or {}}\n"
            f"Validation feedback from the previous attempt: {validation_feedback or []}\n"
            "If feedback is present, correct every listed issue without changing the user's facts.\n"
            f"User input:\n{text}"
        )
        try:
            return agent.run_sync(prompt).output
        except Exception as error:
            print(f"PydanticAI task parser fallback: {type(error).__name__}: {error}", flush=True)
            return None
