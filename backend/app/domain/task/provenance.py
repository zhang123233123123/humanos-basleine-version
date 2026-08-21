"""Field-level Task provenance without persistence or transport coupling."""

from __future__ import annotations

from typing import Any


PROVENANCE_SOURCES = frozenset({
    "user_input", "ai_extracted", "local_rules", "execution_feedback",
    "system_derived", "legacy_persisted",
})

TASK_PROVENANCE_FIELDS = frozenset({
    "title", "task_type", "deadline", "duration", "priority", "status",
    "context", "progress", "next_step", "open_questions",
    "resource_modality", "attention_mode", "parallelizable",
    "expected_difficulty", "dependency",
})


def provenance_record(source: object, *, source_id: object = None, confidence: object = None, updated_at: int) -> dict[str, Any]:
    normalized = str(source or "system_derived")
    if normalized not in PROVENANCE_SOURCES:
        normalized = "system_derived"
    result: dict[str, Any] = {"source": normalized, "updated_at": int(updated_at)}
    if source_id:
        result["source_id"] = str(source_id)
    if confidence is not None:
        try:
            result["confidence"] = min(max(float(confidence), 0.0), 1.0)
        except (TypeError, ValueError):
            pass
    return result


def normalize_field_provenance(value: object, *, updated_at: int, fallback_source: str = "legacy_persisted") -> dict[str, dict[str, Any]]:
    if not isinstance(value, dict):
        return {}
    normalized: dict[str, dict[str, Any]] = {}
    for field, raw in value.items():
        if field not in TASK_PROVENANCE_FIELDS:
            continue
        item = raw if isinstance(raw, dict) else {"source": raw}
        normalized[field] = provenance_record(
            item.get("source") or fallback_source,
            source_id=item.get("source_id"), confidence=item.get("confidence"),
            updated_at=int(item.get("updated_at") or updated_at),
        )
    return normalized


def update_field_provenance(
    current: object, *, fields: set[str], source: str, updated_at: int,
    source_id: object = None, confidence: object = None,
) -> dict[str, dict[str, Any]]:
    result = normalize_field_provenance(current, updated_at=updated_at)
    record = provenance_record(source, source_id=source_id, confidence=confidence, updated_at=updated_at)
    for field in fields & TASK_PROVENANCE_FIELDS:
        result[field] = dict(record)
    return result
