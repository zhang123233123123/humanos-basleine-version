"""Human-centered scheduling policy primitives.

The policy is deliberately pure: it does not read persistence, call an LLM, or
write a plan.  It turns already-observed task demand and momentary self-report
into an auditable *soft* assessment.  Hard calendar feasibility remains owned
by the timeline validator.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any


DEMAND_LEVELS = {"low": 1, "medium": 2, "high": 3}
PRIORITY_RANK = {"high": 0, "高": 0, "medium": 1, "中": 1, "low": 2, "低": 2}
COST_RANK = {"low": 0, "medium": 1, "high": 2}
FIT_RANK = {"ideal": 0, "acceptable": 1, "risky": 2, "unknown": 3}


@dataclass(frozen=True)
class SchedulingPolicyDecision:
    fit: str
    confidence: str
    evidence: tuple[str, ...]
    scope: str = "today_next_session_only"
    authority: str = "soft_advisory"

    def to_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["evidence"] = list(self.evidence)
        return result


def assess_next_session_fit(task_demand: object, runtime_state: dict[str, Any] | None) -> SchedulingPolicyDecision:
    """Assess one immediate Session without inventing a human capacity score.

    Missing evidence produces ``unknown``.  The result may rank otherwise
    feasible candidates, but must never override deadlines, availability, or
    explicit user confirmation.
    """
    if isinstance(task_demand, dict):
        demand = str(task_demand.get("level") or task_demand.get("cognitive_load") or "").strip().lower()
    else:
        demand = str(task_demand or "").strip().lower()
    state = dict(runtime_state or {})
    observed = {key: state.get(key) for key in ("focus", "energy", "stress") if state.get(key) is not None}
    if demand not in DEMAND_LEVELS or len(observed) < 2:
        return SchedulingPolicyDecision(
            fit="unknown",
            confidence="low",
            evidence=("Insufficient task-demand or current-state evidence; no capacity claim was made.",),
        )

    try:
        focus = int(state.get("focus", 4))
        energy = int(state.get("energy", 4))
        stress = int(state.get("stress", 4))
    except (TypeError, ValueError):
        return SchedulingPolicyDecision(
            fit="unknown",
            confidence="low",
            evidence=("Current-state values were not comparable; no capacity claim was made.",),
        )

    evidence = (
        f"Task demand was classified as {demand}.",
        f"Current self-report: focus {focus}/7, energy {energy}/7, stress {stress}/7.",
    )
    if focus <= 3 or energy <= 3 or stress >= 6:
        fit = "risky" if demand == "high" else "acceptable"
    elif focus >= 6 and energy >= 5 and stress <= 5:
        fit = "ideal" if demand == "high" else "acceptable"
    else:
        fit = "acceptable"
    return SchedulingPolicyDecision(fit=fit, confidence="medium", evidence=evidence)


def _instant(value: object) -> float:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).timestamp()
    except (TypeError, ValueError):
        return float("inf")


def rank_ready_sessions(
    candidates: list[dict[str, Any]],
    runtime_state: dict[str, Any] | None,
    *,
    reference_now: object = None,
) -> list[dict[str, Any]]:
    """Rank already-ready Sessions with an explicit lexicographic policy.

    Future Sessions retain confirmed planned order. Overdue Sessions receive a
    bounded aging boost before planned time is considered. Capacity remains a
    tiebreak and cannot reorder work merely because it appears easier now.
    """
    now_instant = _instant(reference_now) if reference_now else datetime.now(timezone.utc).timestamp()
    ranked: list[dict[str, Any]] = []
    for raw in candidates:
        item = dict(raw)
        decision = assess_next_session_fit(item.get("task_demand"), runtime_state)
        item["scheduling_policy"] = decision.to_dict()
        planned_start = str(item.get("planned_start_at") or "")
        planned_instant = _instant(planned_start)
        priority = str(item.get("priority") or "medium").strip().lower()
        reentry_cost = str(item.get("reentry_cost") or item.get("switch_cost") or "medium").strip().lower()
        overdue_minutes = max(int((now_instant - planned_instant) // 60), 0) if planned_instant != float("inf") else 0
        aging_steps = min(overdue_minutes // (24 * 60), 2)
        effective_priority = max(PRIORITY_RANK.get(priority, 1) - aging_steps, 0)
        future_bucket = 1 if planned_instant > now_instant else 0
        item["scheduling_policy"]["rank_evidence"] = [
            f"Planned start: {planned_start}.",
            f"Task priority: {priority}.",
            f"Overdue aging: {overdue_minutes} minutes ({aging_steps} bounded priority steps).",
            f"Capacity fit: {decision.fit} ({decision.confidence} confidence).",
            f"Re-entry cost: {reentry_cost}.",
        ]
        item["scheduling_policy"]["aging_minutes"] = overdue_minutes
        item["scheduling_policy"]["aging_steps"] = aging_steps
        item["_policy_rank"] = (
            future_bucket,
            effective_priority if not future_bucket else 0,
            planned_instant,
            PRIORITY_RANK.get(priority, 1),
            FIT_RANK.get(decision.fit, 3),
            COST_RANK.get(reentry_cost, 1),
            str(item.get("execution_session_id") or ""),
        )
        ranked.append(item)
    ranked.sort(key=lambda item: item["_policy_rank"])
    for position, item in enumerate(ranked, start=1):
        item.pop("_policy_rank", None)
        item["scheduling_policy"]["queue_position"] = position
        item["scheduling_policy"]["policy_version"] = "ready_queue_lexicographic_v2"
    return ranked
