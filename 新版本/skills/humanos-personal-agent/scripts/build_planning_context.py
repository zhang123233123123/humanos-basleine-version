#!/usr/bin/env python3
import json, sys
from datetime import datetime, timezone
from pathlib import Path

def read_json(root, name, fallback):
    try: return json.loads((root / name).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError): return fallback

def parse_time(value):
    if not value: return None
    try: return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError: return None

def main():
    root = Path(sys.argv[1]).resolve()
    identity = read_json(root, "identity.json", {})
    profile = read_json(root, "profile.json", {})
    state = read_json(root, "state.json", {})
    tasks = read_json(root, "tasks.json", {"tasks": []}).get("tasks", [])
    plan = read_json(root, "plan.json", {"candidate": None, "active": None})
    reported = parse_time(state.get("reported_at")); now = datetime.now(timezone.utc); age_hours = None
    if reported:
        if reported.tzinfo is None: reported = reported.replace(tzinfo=timezone.utc)
        age_hours = round((now - reported.astimezone(timezone.utc)).total_seconds() / 3600, 2)
    fresh = state.get("source") == "user_self_report" and age_hours is not None and age_hours <= 6
    open_tasks = [t for t in tasks if t.get("status") not in {"completed", "deleted", "terminated"}]
    print(json.dumps({
        "identity": identity,
        "structured_profile": profile.get("structured_profile", {}),
        "work_rhythm": profile.get("work_rhythm", {}),
        "confirmed_preferences": profile.get("confirmed_preferences", []),
        "current_state": state if fresh else None,
        "state_is_fresh": fresh,
        "state_age_hours": age_hours,
        "state_requirement": None if fresh else "Ask for a current check-in before energy-sensitive scheduling.",
        "open_tasks": open_tasks,
        "active_plan": plan.get("active"), "candidate_plan": plan.get("candidate"),
        "planning_rules": ["Consider every open task and active session.", "Use energy only when state_is_fresh.", "Never treat defaults as self-report.", "Write revisions as candidate plans."],
    }, ensure_ascii=False))

if __name__ == "__main__": main()
