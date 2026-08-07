"""Generate isolated, deterministic local-QA database snapshots.

This script reuses the production Store and the shared test clock. It does not
introduce a second scheduling clock, and it never writes to the research DB.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

if os.environ.get("HUMANOS_TEST_MODE") != "1" or os.environ.get("HUMANOS_QA_DB") != "1":
    raise SystemExit("Set HUMANOS_TEST_MODE=1 and HUMANOS_QA_DB=1 before generating QA scenarios")

from backend import humanos_server as server
from scripts.seed_unified_clock_qa import PASSWORD, USER_EMAIL, main as seed_main


SCENARIO_DIR = Path(os.environ.get("HUMANOS_QA_SCENARIO_DIR", ROOT / "qa-local" / "scenarios"))
ACTIVE_DB = Path(os.environ["HUMANOS_DB_PATH"])


def set_clock(value: str) -> None:
    server._TEST_CLOCK_BASE = datetime.fromisoformat(value)
    server._TEST_CLOCK_ANCHOR = time.monotonic()
    server._TEST_CLOCK_SCALE = 0


def snapshot(name: str, from_path: Path) -> Path:
    target = SCENARIO_DIR / f"{name}.db"
    shutil.copy2(from_path, target)
    return target


def first_session(store: server.Store, user_id: str) -> dict:
    sessions = sorted(store.list_execution_sessions(user_id), key=lambda item: (item["planned_start_at"], item["execution_session_id"]))
    return sessions[0]


def mutate_execution(database: Path, user_id: str, mode: str) -> None:
    store = server.Store(database)
    session = first_session(store, user_id)
    set_clock("2026-08-03T09:00:00+08:00")
    started = store.start_execution_session(user_id, {
        "execution_session_id": session["execution_session_id"],
        "request_id": f"qa-{mode}-start",
    })
    if mode == "running_20":
        set_clock("2026-08-03T09:20:00+08:00")
        return
    set_clock("2026-08-03T09:20:00+08:00")
    if mode == "paused":
        store.pause_execution_session(user_id, {
            "execution_session_id": started["execution_session_id"],
            "actual_minutes": 20,
            "request_id": "qa-paused-pause",
        })
        set_clock("2026-08-03T09:25:00+08:00")
        return
    set_clock("2026-08-03T09:45:00+08:00")
    store.end_execution_session(user_id, {
        "execution_session_id": started["execution_session_id"],
        "actual_minutes": 45,
        "request_id": f"qa-{mode}-end",
    })
    if mode == "partial_feedback":
        store.save_execution_feedback(user_id, {
            "task_id": started["task_id"],
            "execution_session_id": started["execution_session_id"],
            "request_id": "qa-partial-feedback",
            "trigger": "session_ended",
            "task_evaluation": {
                "completion": "partial",
                "actual_minutes": 45,
                "remaining_duration_minutes": 135,
                "perceived_difficulty": 5,
            },
            "state_evaluation": {"focus": 5, "energy": 4, "stress": 3},
            "recommendation_evaluation": {"helpful": True},
        })


def mutate_plan_v2(database: Path, user_id: str) -> None:
    store = server.Store(database)
    active = store.active_plan(user_id, "2026-08-03")
    patch = list(active["plan_patch"])
    changed = dict(patch[0])
    changed.update({"block_id": "T1-MON-1-V2", "start": 9.25, "end": 10.0})
    patch[0] = changed
    proposal = store.save_proposed_plan(user_id, {
        "plan_patch": patch,
        "explanation": "QA plan revision: the first work block moved by 15 minutes.",
        "user_reason": "The revised start better matches the local QA scenario.",
    }, {"week_id": "2026-08-03", "request_id": "qa-plan-v2"})
    store.confirm_plan(user_id, {
        "plan_id": proposal["plan_id"],
        "plan_revision": proposal["plan_revision"],
        "edit_episode_id": proposal["edit_episode_id"],
        "week_id": "2026-08-03",
        "plan_patch": patch,
        "decision": proposal,
        "rationale": {
            "response_status": "answered",
            "raw_user_response": "The later start fits this QA scenario.",
            "reason_codes": ["better_timing"],
            "generalizability": "only_this_week",
        },
    })


def main() -> None:
    SCENARIO_DIR.mkdir(parents=True, exist_ok=True)
    ACTIVE_DB.parent.mkdir(parents=True, exist_ok=True)
    seed_main()
    base = snapshot("base", ACTIVE_DB)
    store = server.Store(base)
    user = store.authenticate_user(USER_EMAIL, PASSWORD)["user"]
    user_id = user["id"]

    definitions = [
        ("base", "Base reset", "2026-08-03T08:45:00+08:00", "Independent baseline before the first session.", None),
        ("before_15", "Session -15 min", "2026-08-03T08:45:00+08:00", "Fifteen minutes before the first session.", None),
        ("ready", "Ready", "2026-08-03T09:00:00+08:00", "Session is ready but has not been started.", None),
        ("running_20", "Running 20 min", "2026-08-03T09:20:00+08:00", "The user explicitly started the session 20 minutes ago.", "running_20"),
        ("paused", "Paused", "2026-08-03T09:25:00+08:00", "The user explicitly paused after 20 minutes.", "paused"),
        ("ended", "Ended · feedback due", "2026-08-03T09:45:00+08:00", "The session ended and still needs feedback.", "ended"),
        ("partial_feedback", "Partial feedback", "2026-08-03T09:46:00+08:00", "Partial completion feedback has been saved.", "partial_feedback"),
        ("plan_edit", "Plan edit", "2026-08-03T08:45:00+08:00", "Open a confirmed task for a QA plan edit.", None),
        ("rationale_prompt", "Rationale prompt", "2026-08-03T08:45:00+08:00", "Show the optional research rationale prompt for a draft edit.", None),
        ("plan_v2", "Plan v2 confirmed", "2026-08-03T08:45:00+08:00", "A second confirmed plan revision replaces future v1 sessions.", None),
        ("sunday_2359", "Sunday 23:59", "2026-08-09T23:59:00+08:00", "One minute before the ISO week changes.", None),
        ("new_week", "New week", "2026-08-10T00:00:00+08:00", "The clock entered a new week; rollover remains a user decision.", None),
    ]

    scenarios = []
    for scenario_id, label, simulated_time, description, execution_mode in definitions:
        if scenario_id == "base":
            target = base
        else:
            target = snapshot(scenario_id, base)
        if execution_mode:
            mutate_execution(target, user_id, execution_mode)
        if scenario_id == "plan_edit":
            server.Store(target).patch_task("T1", {"due": "2026-08-08 18:00"}, user_id)
        if scenario_id in {"rationale_prompt", "plan_v2"}:
            mutate_plan_v2(target, user_id)
        ui_hint = None
        if scenario_id == "plan_edit":
            ui_hint = {"type": "open_task", "task_id": "T1"}
        elif scenario_id == "rationale_prompt":
            ui_hint = {"type": "rationale_prompt", "summary": {"moved": 1, "resized": 0, "added": 0, "removed": 0}}
        scenarios.append({
            "id": scenario_id,
            "label": label,
            "kind": "snapshot",
            "simulated_time": simulated_time,
            "database": target.name,
            "description": description,
            "ui_hint": ui_hint,
        })

    manifest = {
        "version": 1,
        "timezone": "Asia/Singapore",
        "week_id": "2026-08-03",
        "qa_user": {"id": user_id, "email": USER_EMAIL, "password": PASSWORD},
        "scenarios": scenarios,
    }
    (SCENARIO_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    shutil.copy2(base, ACTIVE_DB)
    print(json.dumps({"scenario_dir": str(SCENARIO_DIR), "active_db": str(ACTIVE_DB), "scenarios": len(scenarios)}))


if __name__ == "__main__":
    main()
