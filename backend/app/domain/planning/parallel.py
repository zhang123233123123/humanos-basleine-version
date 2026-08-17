"""Pure transformations for user-confirmed parallel plan blocks."""

from __future__ import annotations

from copy import deepcopy

PARALLEL_DECISION_ACTIONS = frozenset({"combine", "keep_separate"})


def validate_parallel_decision_action(value: object) -> str:
    """Return a supported user decision without silently coercing bad input."""
    action = value if isinstance(value, str) else ""
    if action not in PARALLEL_DECISION_ACTIONS:
        allowed = ", ".join(sorted(PARALLEL_DECISION_ACTIONS))
        raise ValueError(f"action must be one of: {allowed}")
    return action


def _minutes(block: dict, field: str) -> int:
    if block.get(field) is not None:
        return max(int(block[field]), 0)
    return max(round((float(block["end"]) - float(block["start"])) * 60), 0)


def apply_parallel_overlap(plan_patch: list[dict], suggestion: dict) -> list[dict]:
    """Overlap part of two Sessions without changing either Task's total work.

    The host Session remains intact. The guest Session contributes one parallel
    segment and retains any remainder at its original position.
    """
    host_block_id = str(suggestion.get("primary_block_id") or "")
    guest_block_id = str(suggestion.get("secondary_block_id") or "")
    group_id = str(suggestion.get("parallel_group_id") or "")
    task_ids = [str(suggestion.get("primary_task_id") or ""), str(suggestion.get("secondary_task_id") or "")]
    overlap = int(suggestion.get("suggested_overlap_minutes") or 0)
    if not host_block_id or not guest_block_id or not group_id or not all(task_ids):
        raise ValueError("Parallel suggestion is missing block, task, or group identity")
    if overlap < 15 or overlap % 15:
        raise ValueError("Parallel overlap must use a positive 15-minute grid")

    blocks = deepcopy(plan_patch)
    host = next((block for block in blocks if str(block.get("block_id")) == host_block_id), None)
    guest = next((block for block in blocks if str(block.get("block_id")) == guest_block_id), None)
    if not host or not guest or host is guest:
        raise ValueError("Parallel suggestion no longer matches two plan blocks")
    if str(host.get("task_id")) != task_ids[0] or str(guest.get("task_id")) != task_ids[1]:
        raise ValueError("Parallel suggestion task and block identities do not match")

    host_session = _minutes(host, "session_minutes")
    guest_session = _minutes(guest, "session_minutes")
    host_work = _minutes(host, "planned_work_minutes")
    guest_work = _minutes(guest, "planned_work_minutes")
    if overlap > min(host_session, guest_session, host_work, guest_work):
        raise ValueError("Parallel overlap exceeds one Session's available work")

    day_index = int(suggestion.get("day_index"))
    start = float(suggestion.get("start"))
    end = start + overlap / 60.0
    shared = {
        "parallel_group_id": group_id,
        "parallel_user_confirmed": True,
        "parallel_task_ids": task_ids,
        "allowed_overlap_minutes": overlap,
    }
    host.update({**shared, "parallel_role": "primary"})

    remainder_session = guest_session - overlap
    remainder_work = guest_work - overlap
    if remainder_work:
        guest["end"] = float(guest["start"]) + remainder_session / 60.0
        guest["session_minutes"] = remainder_session
        guest["planned_work_minutes"] = remainder_work
        guest.pop("start_at", None)
        guest.pop("end_at", None)
        parallel_guest = {
            **guest,
            "block_id": f"{guest_block_id}-parallel-{group_id}",
            "day_index": day_index,
            "start": start,
            "end": end,
            "session_minutes": overlap,
            "planned_work_minutes": overlap,
            **shared,
            "parallel_role": "secondary",
        }
        parallel_guest.pop("start_at", None)
        parallel_guest.pop("end_at", None)
        blocks.append(parallel_guest)
    else:
        guest.update({
            "day_index": day_index,
            "start": start,
            "end": end,
            "session_minutes": overlap,
            "planned_work_minutes": overlap,
            **shared,
            "parallel_role": "secondary",
        })
        guest.pop("start_at", None)
        guest.pop("end_at", None)

    return blocks
