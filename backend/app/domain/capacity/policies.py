"""Pure policies for validating AI-proposed human-capacity fit."""

from __future__ import annotations

from dataclasses import dataclass


CAPACITY_LEVELS = ("ideal", "acceptable", "risky", "unsuitable")
CAPACITY_PENALTIES = {"ideal": 0, "acceptable": 8, "risky": 40, "unsuitable": 200}


@dataclass(frozen=True)
class CapacityAssessment:
    level: str
    evidence: tuple[str, ...]
    tradeoff: str | None = None


def validate_capacity_assessment(block: dict) -> tuple[CapacityAssessment, list[dict]]:
    """Normalize one block assessment and return machine-readable violations."""
    task_id = block.get("task_id")
    raw_level = str(block.get("capacity_fit") or "").strip().lower()
    violations: list[dict] = []
    if raw_level not in CAPACITY_LEVELS:
        violations.append({"type": "invalid_capacity_fit", "task_id": task_id, "capacity_fit": raw_level or None})
        level = "unsuitable"
    else:
        level = raw_level
    evidence = tuple(str(item).strip() for item in (block.get("capacity_evidence") or []) if str(item).strip())
    if not evidence:
        violations.append({"type": "missing_capacity_evidence", "task_id": task_id})
    tradeoff = str(block.get("capacity_tradeoff") or "").strip() or None
    if level == "risky" and not tradeoff:
        violations.append({"type": "missing_capacity_tradeoff", "task_id": task_id})
    if level == "unsuitable":
        violations.append({"type": "unsuitable_capacity_assignment", "task_id": task_id})
    return CapacityAssessment(level=level, evidence=evidence, tradeoff=tradeoff), violations


def capacity_penalty(counts: dict[str, int]) -> int:
    """Rank already feasible candidates; this never replaces hard validation."""
    return sum(max(int(counts.get(level, 0)), 0) * penalty for level, penalty in CAPACITY_PENALTIES.items())
