"""Hard invariants for a canonical weekly timeline."""

from __future__ import annotations

from .models import TimelineViolation, WeeklyTimeline


def validate_timeline(timeline: WeeklyTimeline, *, rest_between_tasks_minutes: int = 0) -> list[TimelineViolation]:
    violations: list[TimelineViolation] = []
    intervals = timeline.ordered_intervals()
    for index, left in enumerate(intervals):
        for right in intervals[index + 1:]:
            if right.week_start_minute >= left.week_end_minute:
                break
            if left.parallelizable and right.parallelizable:
                continue
            violations.append(TimelineViolation(
                type="timeline_overlap",
                interval_ids=[left.id, right.id],
                task_ids=[task_id for task_id in (left.task_id, right.task_id) if task_id],
                message="Two non-parallel timeline intervals overlap.",
            ))
    task_sessions = [item for item in intervals if item.kind == "task_session"]
    for previous, current in zip(task_sessions, task_sessions[1:]):
        if previous.day_index != current.day_index:
            continue
        gap = current.week_start_minute - previous.week_end_minute
        if 0 <= gap < rest_between_tasks_minutes:
            violations.append(TimelineViolation(
                type="insufficient_rest",
                interval_ids=[previous.id, current.id],
                task_ids=[task_id for task_id in (previous.task_id, current.task_id) if task_id],
                message=f"Task sessions require at least {rest_between_tasks_minutes} minutes of rest.",
            ))
    timeline.violations = violations
    return violations
