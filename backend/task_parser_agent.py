"""Typed HumanOS task parsing through PydanticAI.

The agent only converts language into validated task facts. It never chooses
calendar slots; scheduling remains the responsibility of the weekly timeline
and Python constraint engine.
"""

from __future__ import annotations

import os
from typing import Literal

from pydantic import BaseModel, Field, model_validator
from pydantic_ai import Agent, PromptedOutput
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider


class ParsedTask(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    schedule_type: Literal["fixed_event", "flexible_task", "recovery_task"] = "flexible_task"
    duration_minutes: int | None = Field(default=None, ge=1, le=1440)
    start_at: str | None = None
    deadline_at: str | None = None
    priority: Literal["高", "中", "低"] | None = None
    context: str = ""
    missing_fields: list[str] = Field(default_factory=list)
    source_spans: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def enforce_temporal_semantics(self) -> "ParsedTask":
        if self.schedule_type == "fixed_event" and not self.start_at:
            if "start_at" not in self.missing_fields:
                self.missing_fields.append("start_at")
        if self.schedule_type != "fixed_event" and not self.deadline_at:
            if "deadline_at" not in self.missing_fields:
                self.missing_fields.append("deadline_at")
        if self.duration_minutes is None and "duration_minutes" not in self.missing_fields:
            self.missing_fields.append("duration_minutes")
        return self


class ParsedTaskBatch(BaseModel):
    tasks: list[ParsedTask] = Field(default_factory=list, max_length=8)


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
- Priority values are exactly 高, 中, or 低.
- Record absent required fields in missing_fields.
""".strip()


def parse_tasks_with_agent(
    text: str,
    *,
    current_time: str,
    timezone_name: str,
    chat_context: dict | None = None,
) -> list[dict] | None:
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        return None
    base_url = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    model = OpenAIChatModel(
        os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
        provider=OpenAIProvider(base_url=base_url, api_key=api_key),
    )
    agent = Agent(model, output_type=PromptedOutput(ParsedTaskBatch), system_prompt=SYSTEM_PROMPT)
    context_summary = chat_context or {}
    prompt = (
        f"Current time: {current_time}\n"
        f"Timezone: {timezone_name}\n"
        f"Recent context: {context_summary}\n"
        f"User input:\n{text}"
    )
    try:
        result = agent.run_sync(prompt)
    except Exception as error:
        print(f"PydanticAI task parser fallback: {type(error).__name__}: {error}", flush=True)
        return None
    return [task.model_dump() for task in result.output.tasks]
