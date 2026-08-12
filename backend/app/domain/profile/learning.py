"""Policies that convert episodic evidence into user-controlled Profile patterns."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo


CANDIDATE_EPISODE_THRESHOLD = 3


def build_pattern_candidates(
    episodes: list[dict[str, Any]],
    *,
    timezone_name: str,
) -> list[dict[str, Any]]:
    groups: dict[str, list[int]] = {}
    for episode in episodes:
        metadata = episode.get("metadata") or {}
        label = metadata.get("pattern_label") or metadata.get("stop_reason")
        if label:
            groups.setdefault(str(label), []).append(int(episode.get("created_at") or 0))

    zone = ZoneInfo(timezone_name)
    candidates = []
    for label, timestamps in groups.items():
        evidence_days = {
            datetime.fromtimestamp(timestamp / 1000, tz=zone).date().isoformat()
            for timestamp in timestamps
            if timestamp > 0
        }
        candidates.append({
            "pattern_label": label,
            "episode_count": len(timestamps),
            "evidence_day_count": len(evidence_days),
            "status": (
                "candidate"
                if len(timestamps) >= CANDIDATE_EPISODE_THRESHOLD
                else "insufficient_evidence"
            ),
            "can_suggest_update": len(timestamps) >= CANDIDATE_EPISODE_THRESHOLD,
            "auto_apply": len(timestamps) >= CANDIDATE_EPISODE_THRESHOLD,
            "requires_user_confirmation": False,
        })
    return sorted(candidates, key=lambda item: (-item["episode_count"], item["pattern_label"]))


def promote_confirmed_pattern(
    learned_patterns: list[dict[str, Any]],
    *,
    pattern_label: str,
    evidence_count: int,
    user_confirmed: bool,
    confirmed_at: int,
) -> list[dict[str, Any]]:
    if not user_confirmed:
        raise ValueError("user confirmation is required before updating static profile")
    label = pattern_label.strip()
    if not label:
        raise ValueError("pattern_label is required")

    result = [dict(item) for item in learned_patterns]
    existing = next((item for item in result if item.get("pattern_label") == label), None)
    if existing:
        existing["evidence_count"] = max(int(existing.get("evidence_count") or 0), evidence_count)
        existing["user_confirmed"] = True
        existing.setdefault("confirmed_at", confirmed_at)
    else:
        result.append({
            "pattern_label": label,
            "evidence_count": max(evidence_count, 1),
            "user_confirmed": True,
            "confirmed_at": confirmed_at,
        })
    return result


def promote_automatic_pattern(
    learned_patterns: list[dict[str, Any]],
    *,
    pattern_label: str,
    evidence_count: int,
    learned_at: int,
) -> list[dict[str, Any]]:
    """Promote a repeated observation without asking for another confirmation.

    The evidence threshold is enforced by ``build_pattern_candidates``.  The
    resulting preference remains editable and removable by the user.
    """
    label = pattern_label.strip()
    if not label:
        raise ValueError("pattern_label is required")

    result = [dict(item) for item in learned_patterns]
    existing = next((item for item in result if item.get("pattern_label") == label), None)
    if existing:
        existing["evidence_count"] = max(int(existing.get("evidence_count") or 0), evidence_count)
        existing["auto_learned"] = True
        existing["active"] = True
        existing.setdefault("learned_at", learned_at)
    else:
        result.append({
            "pattern_label": label,
            "evidence_count": max(evidence_count, CANDIDATE_EPISODE_THRESHOLD),
            "user_confirmed": False,
            "auto_learned": True,
            "active": True,
            "learned_at": learned_at,
        })
    return result
