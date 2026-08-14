#!/usr/bin/env python3
import json, sys
from datetime import datetime
from pathlib import Path

def parse(value):
    try: return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError): return None

def main():
    root = Path(sys.argv[1]).resolve()
    plan_doc = json.loads((root / "plan.json").read_text(encoding="utf-8"))
    tasks = json.loads((root / "tasks.json").read_text(encoding="utf-8")).get("tasks", [])
    task_by_id = {str(t.get("id") or t.get("task_id")): t for t in tasks}
    plan = plan_doc.get("candidate") or plan_doc.get("active"); errors, warnings = [], []
    if not plan:
        print(json.dumps({"valid": True, "errors": [], "warnings": ["No plan to validate"]})); return
    parsed, totals = [], {}
    for index, session in enumerate(plan.get("sessions", [])):
        start, end = parse(session.get("start")), parse(session.get("end"))
        if not start or not end or end <= start:
            errors.append(f"Session {index + 1} has invalid start/end"); continue
        parsed.append((start, end, session)); task_id = str(session.get("task_id") or "")
        totals[task_id] = totals.get(task_id, 0) + int((end - start).total_seconds() / 60)
        deadline = parse(task_by_id.get(task_id, {}).get("deadline"))
        if deadline and end > deadline: errors.append(f"Session {index + 1} ends after task deadline")
    parsed.sort(key=lambda x: x[0])
    for previous, current in zip(parsed, parsed[1:]):
        if current[0] < previous[1]: errors.append("Plan contains overlapping sessions")
    for task_id, minutes in totals.items():
        estimate = task_by_id.get(task_id, {}).get("estimated_minutes")
        if isinstance(estimate, (int, float)) and minutes < estimate: warnings.append(f"Task {task_id}: {minutes}/{estimate} minutes scheduled")
    print(json.dumps({"valid": not errors, "errors": errors, "warnings": warnings}, ensure_ascii=False))

if __name__ == "__main__": main()
