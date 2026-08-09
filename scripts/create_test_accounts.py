#!/usr/bin/env python3
"""Idempotently create local HumanOS test accounts."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from humanos_server import Store  # noqa: E402


EMAILS = [f"qa{index:02d}@humanos.local" for index in range(1, 6)]
PASSWORD = "HumanOS-QA-2026!"


def main() -> None:
    store = Store(ROOT / "backend" / "data" / "humanos.db")
    for index, email in enumerate(EMAILS, 1):
        row = store.user_row(email)
        if not row:
            store.create_user(email, PASSWORD, f"QA Tester {index:02d}")
            row = store.user_row(email)
        with store.connect() as conn:
            conn.execute("UPDATE users SET account_type='test' WHERE id=?", (row["id"],))
        print(email)


if __name__ == "__main__":
    main()
