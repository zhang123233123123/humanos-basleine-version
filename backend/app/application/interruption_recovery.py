"""Evidence and descriptive summaries for interruption recovery episodes."""

from __future__ import annotations

from typing import Any

from app.domain.personalization import EvidenceItem, EvidenceScope


def project_recovery_evidence(*, evidence_id: str, episode: dict[str, Any], stage: str) -> EvidenceItem:
    if stage not in {"attempt", "outcome"}:
        raise ValueError("recovery evidence stage must be attempt or outcome")
    outcome = dict(episode.get("outcome") or {})
    return EvidenceItem(
        evidence_id=evidence_id,
        user_id=str(episode["user_id"]),
        source_type="system_observation",
        source_id=f"{episode['id']}:{stage}",
        origin="observed_behavior",
        observed_at=int(episode.get("updated_at") or episode["created_at"]),
        claim_key=f"interruption.recovery_{stage}",
        structured_value={
            "interruption_id": episode["id"],
            "source_execution_session_id": episode["source_execution_session_id"],
            "resumed_execution_session_id": episode.get("resumed_execution_session_id"),
            "interruption_action": episode["interruption_action"],
            "pause_reason": episode["pause_reason"],
            "resume_latency_minutes": episode.get("resume_latency_minutes"),
            "context_dump_id": episode.get("context_dump_id"),
            "reentry_guidance_generated": bool(episode.get("reentry_guidance_generated_at")),
            "task_demand_snapshot": dict(episode.get("task_demand_snapshot") or {}),
            "runtime_state_snapshot": dict(episode.get("runtime_state_snapshot") or {}),
            "profile_trait_refs": list(episode.get("profile_trait_refs") or []),
            "outcome": outcome if stage == "outcome" else {},
        },
        scope=EvidenceScope(task_id=str(episode["task_id"])),
        user_explicit=stage == "outcome" and bool(outcome),
        confidence_level="high",
        eligible_for_pattern=False,
    )


def summarize_recovery_episodes(episodes: list[dict[str, Any]]) -> dict[str, Any]:
    resumed = [item for item in episodes if item.get("resumed_at")]
    settled = [item for item in episodes if item.get("status") == "settled"]
    latencies = sorted(int(item["resume_latency_minutes"]) for item in resumed if item.get("resume_latency_minutes") is not None)
    completion = {"completed": 0, "partial": 0, "not_started": 0, "other": 0}
    reinterrupted = 0
    for item in settled:
        outcome = dict(item.get("outcome") or {})
        value = str(outcome.get("completion") or "other")
        completion[value if value in completion else "other"] += 1
        reinterrupted += int(bool(outcome.get("reinterrupted")))
    median = None
    if latencies:
        middle = len(latencies) // 2
        median = latencies[middle] if len(latencies) % 2 else round((latencies[middle - 1] + latencies[middle]) / 2)
    return {
        "episode_count": len(episodes), "pending_count": sum(item.get("status") == "pending" for item in episodes),
        "resumed_count": len(resumed), "settled_count": len(settled), "completion": completion,
        "reinterrupted_count": reinterrupted, "median_resume_latency_minutes": median,
        "causal_claim_allowed": False, "profile_write_allowed": False,
    }
