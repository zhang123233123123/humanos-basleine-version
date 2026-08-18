"""Shared construction of evidence scope from a Task snapshot."""

from __future__ import annotations

from typing import Any

from app.domain.personalization import EvidenceScope


def build_task_evidence_scope(task: dict[str, Any] | None) -> EvidenceScope:
    if not task:
        return EvidenceScope()
    return EvidenceScope(
        task_id=str(task.get("id") or "") or None,
        task_schedule_type=task.get("task_type"),
        task_domain_type=str(task.get("type") or "") or None,
        resource_modality=task.get("resource_modality") or [],
        attention_mode=task.get("attention_mode"),
    )
