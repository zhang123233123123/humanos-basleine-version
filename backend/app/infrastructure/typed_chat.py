"""Provider-neutral typed JSON generation with one bounded schema retry."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel


Completion = Callable[..., object | None]
RejectionReporter = Callable[[str, Exception], None]


def _json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _contract_message(output_model: type[BaseModel], label: str) -> dict[str, str]:
    return {
        "role": "system",
        "content": _json({
            "instruction": "Return JSON only. The response must validate against this exact JSON Schema. Do not add fields or invent user facts.",
            "output_schema_version": f"{label}-v1",
            "json_schema": output_model.model_json_schema(),
        }),
    }


def _with_initial_contract(
    messages: list[dict[str, Any]],
    output_model: type[BaseModel],
    label: str,
) -> list[dict[str, Any]]:
    contract = _contract_message(output_model, label)
    if messages and messages[0].get("role") == "system":
        return [messages[0], contract, *messages[1:]]
    return [contract, *messages]


def _validated(payload: object, output_model: type[BaseModel]) -> dict[str, Any]:
    return output_model.model_validate(payload).model_dump(
        mode="json",
        exclude_none=True,
        exclude_unset=True,
    )


def generate_typed_json(
    messages: list[dict[str, Any]],
    output_model: type[BaseModel],
    label: str,
    *,
    completion: Completion,
    temperature: float = 0.2,
    report_rejection: RejectionReporter | None = None,
) -> dict[str, Any] | None:
    """Inject the schema on attempt one, then make at most one correction."""
    contracted_messages = _with_initial_contract(messages, output_model, label)
    raw = completion(contracted_messages, temperature=temperature)
    if not isinstance(raw, dict):
        return None
    try:
        return _validated(raw, output_model)
    except Exception as first_error:
        if report_rejection:
            report_rejection(label, first_error)
        errors = first_error.errors(include_url=False) if hasattr(first_error, "errors") else [{"msg": str(first_error)}]
        retry = completion(
            [
                *contracted_messages,
                {"role": "assistant", "content": _json(raw)},
                {
                    "role": "user",
                    "content": _json({
                        "instruction": "Correct only the response structure. Return JSON matching the previously supplied schema. Do not invent new user facts.",
                        "validation_errors": errors,
                    }),
                },
            ],
            temperature=0.0,
        )
        try:
            return _validated(retry, output_model)
        except Exception as retry_error:
            if report_rejection:
                report_rejection(f"{label}_schema_retry", retry_error)
            return None
