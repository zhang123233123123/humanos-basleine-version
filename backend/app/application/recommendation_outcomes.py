"""Descriptive outcomes for HumanOS decision-support recommendations."""

from __future__ import annotations

from typing import Any


def summarize_recommendation_outcomes(
    feedback_events: list[dict[str, Any]],
    interruption_episodes: list[dict[str, Any]],
    execution_feedback_events: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    episodes_by_recommendation: dict[str, dict[str, Any]] = {}
    for episode in interruption_episodes:
        request_id = str(episode.get("request_id") or "")
        if request_id.endswith(":pause"):
            episodes_by_recommendation[request_id.removesuffix(":pause")] = episode
    feedback_by_session: dict[str, dict[str, Any]] = {}
    for event in sorted(execution_feedback_events or [], key=lambda item: int(item.get("created_at") or 0), reverse=True):
        payload = dict(event.get("payload") or {})
        session_id = str(payload.get("execution_session_id") or "")
        if session_id and session_id not in feedback_by_session:
            feedback_by_session[session_id] = payload

    records: list[dict[str, Any]] = []
    seen_recommendation_ids: set[str] = set()
    for event in sorted(feedback_events, key=lambda item: int(item.get("created_at") or (item.get("payload") or {}).get("created_at") or 0), reverse=True):
        feedback = dict(event.get("payload") or {})
        recommendation_id = str(feedback.get("recommendation_id") or "")
        if not recommendation_id or recommendation_id in seen_recommendation_ids:
            continue
        seen_recommendation_ids.add(recommendation_id)
        episode = episodes_by_recommendation.get(recommendation_id)
        outcome = dict((episode or {}).get("outcome") or {})
        session_feedback = feedback_by_session.get(str(feedback.get("execution_session_id") or ""))
        task_evaluation = dict((session_feedback or {}).get("task_evaluation") or {})
        completion = outcome.get("completion") if episode else task_evaluation.get("completion")
        recovery_status = (episode or {}).get("status") or ("settled" if session_feedback else None)
        records.append({
            "recommendation_id": recommendation_id,
            "task_id": feedback.get("task_id"),
            "accepted": bool(feedback.get("accepted")),
            "recommended_action": feedback.get("recommended_action"),
            "selected_action": feedback.get("selected_action"),
            "execution_session_id": feedback.get("execution_session_id"),
            "created_at": feedback.get("created_at") or event.get("created_at"),
            "interruption_episode_id": (episode or {}).get("id"),
            "recovery_status": recovery_status,
            "resume_latency_minutes": (episode or {}).get("resume_latency_minutes"),
            "reinterrupted": outcome.get("reinterrupted") if episode else None,
            "completion": completion,
        })

    accepted = [item for item in records if item["accepted"]]
    settled = [item for item in accepted if item.get("recovery_status") == "settled"]
    latencies = sorted(int(item["resume_latency_minutes"]) for item in accepted if item.get("resume_latency_minutes") is not None)
    median = None
    if latencies:
        middle = len(latencies) // 2
        median = latencies[middle] if len(latencies) % 2 else round((latencies[middle - 1] + latencies[middle]) / 2)
    completion = {"completed": 0, "partial": 0, "not_started": 0, "other": 0}
    for item in settled:
        value = str(item.get("completion") or "other")
        completion[value if value in completion else "other"] += 1
    return {
        "recommendation_count": len(records),
        "accepted_count": len(accepted),
        "rejected_count": len(records) - len(accepted),
        "linked_episode_count": sum(bool(item.get("interruption_episode_id")) for item in accepted),
        "settled_outcome_count": len(settled),
        "outcome_pending_count": len(accepted) - len(settled),
        "reinterrupted_count": sum(item.get("reinterrupted") is True for item in settled),
        "median_resume_latency_minutes": median,
        "completion": completion,
        "recent": records[:6],
        "causal_claim_allowed": False,
        "profile_write_allowed": False,
    }
