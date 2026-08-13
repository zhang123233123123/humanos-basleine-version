"""Response assembly for task-planning chat use cases."""

from __future__ import annotations


def initial_planner_response(intent: str, features: dict, chat_context: dict) -> dict:
    return {
        "intent": intent,
        "features": features,
        "reply": "I recorded this information and will use it in later scheduling decisions.",
        "tasks": [],
        "context": {
            "recent_task_count": len(chat_context.get("recent_tasks", [])),
            "memory_count": len(chat_context.get("retrieved_memories", [])),
            "embedding_model": "humanos-local-hash-embedding-v1",
        },
    }


def apply_weekly_context_update(response: dict, update: dict, format_clock) -> dict:
    item = update["item"]
    display_day = {
        "周一": "Monday", "周二": "Tuesday", "周三": "Wednesday", "周四": "Thursday",
        "周五": "Friday", "周六": "Saturday", "周日": "Sunday",
    }.get(str(item.get("day")), str(item.get("day") or ""))
    response.update({
        "intent": "update_weekly_context",
        "weekly_context": update["weekly_context"],
        "context_event_updated": item,
        "reply": (
            f"Updated “{item.get('title')}” to {display_day} "
            f"{format_clock(float(item.get('start')))}–{format_clock(float(item.get('end')))}. "
            + (
                "This is a routine window. I will preserve it when possible and may shift it by at most 30 minutes for urgent work."
                if item.get("type") == "recurring_routine"
                else "This is fixed time. I will not search for another position; I will keep it there, check conflicts, and generate one revised draft plan around it."
            )
        ),
    })
    return response


def apply_existing_task_updates(response: dict, tasks: list[dict]) -> dict:
    updates = "; ".join(f"{task.get('title')} → {task.get('due')}" for task in tasks)
    response.update({
        "intent": "reschedule",
        "tasks": tasks,
        "reply": f"I understood this as an update to an existing item: {updates}. No duplicate task was created.",
    })
    return response
