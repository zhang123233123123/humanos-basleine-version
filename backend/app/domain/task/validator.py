"""Final deterministic validation for enriched parsed tasks."""

from __future__ import annotations

from typing import Any

from .classifier import TaskDomain
from .models import ParsedTask


VALID_DOMAIN_TYPES: set[TaskDomain] = {
    "deep_work",
    "communication",
    "creative_work",
    "admin",
    "personal",
    "learning",
    "general",
}


def validate_enriched_task(task: ParsedTask, domain_type: str) -> dict[str, Any]:
    errors: list[str] = []
    if domain_type not in VALID_DOMAIN_TYPES:
        errors.append("invalid_domain_type")
    if not task.title.strip():
        errors.append("missing_title")
    return {
        "valid": not errors,
        "errors": errors,
        "checked_by": "python_rule_validator",
    }
