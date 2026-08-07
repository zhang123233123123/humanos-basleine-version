"""Export research-relevant QA tables without exposing authentication data."""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path


db_path = Path(os.environ["HUMANOS_DB_PATH"])
output_path = Path(os.environ.get("HUMANOS_QA_EXPORT", db_path.parent / "unified-clock-database-export.json"))
tables = [
    "profiles",
    "tasks",
    "plans",
    "execution_sessions",
    "execution_feedback",
    "runtime_states",
    "context_dumps",
    "events",
    "plan_edit_episodes",
    "plan_edit_events",
    "plan_change_rationales",
    "weekly_context_history",
]

with sqlite3.connect(db_path) as conn:
    conn.row_factory = sqlite3.Row
    export = {}
    for table in tables:
        exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
        ).fetchone()
        export[table] = [dict(row) for row in conn.execute(f"SELECT * FROM {table}")] if exists else []

output_path.write_text(json.dumps(export, ensure_ascii=False, indent=2), encoding="utf-8")
(output_path.parent / "unified-clock-event-log.json").write_text(
    json.dumps(export.get("events", []), ensure_ascii=False, indent=2), encoding="utf-8"
)
(output_path.parent / "unified-clock-context-dumps.json").write_text(
    json.dumps(export.get("context_dumps", []), ensure_ascii=False, indent=2), encoding="utf-8"
)
print(output_path)
