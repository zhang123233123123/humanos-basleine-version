"""SQLite repository for personalisation outbox and evidence projections."""

from __future__ import annotations

import sqlite3


class PersonalizationEvidenceRepository:
    def __init__(self, connection: sqlite3.Connection):
        self.connection = connection

    def enqueue(self, *, outbox_id: str, user_id: str, kind: str, source_id: str, payload_json: str, timestamp: int) -> None:
        self.connection.execute(
            "INSERT OR IGNORE INTO personalization_outbox (id,user_id,kind,source_id,payload_json,status,attempts,created_at,updated_at) VALUES (?,?,?,?,?,'pending',0,?,?)",
            (outbox_id, user_id, kind, source_id, payload_json, timestamp, timestamp),
        )

    def next_pending(self, *, user_id: str) -> sqlite3.Row | None:
        return self.connection.execute(
            "SELECT * FROM personalization_outbox WHERE user_id=? AND status IN ('pending','failed') ORDER BY sequence_number LIMIT 1",
            (user_id,),
        ).fetchone()

    def mark_processed(self, *, outbox_id: str, timestamp: int) -> None:
        self.connection.execute(
            "UPDATE personalization_outbox SET status='processed',last_error=NULL,updated_at=? WHERE id=?",
            (timestamp, outbox_id),
        )

    def mark_failed(self, *, outbox_id: str, error: str, timestamp: int) -> None:
        self.connection.execute(
            "UPDATE personalization_outbox SET status='failed',attempts=attempts+1,last_error=?,updated_at=? WHERE id=?",
            (error[:1000], timestamp, outbox_id),
        )

    def save_behavior(self, *, event: object, timestamp: int) -> None:
        self.connection.execute(
            "INSERT OR IGNORE INTO behavior_events (id,user_id,source_type,source_id,event_json,effective,created_at) VALUES (?,?,?,?,?,1,?)",
            (event.event_id, event.user_id, event.source_type, event.source_id, event.model_dump_json(), timestamp),
        )

    def save_evidence(self, *, evidence: object, timestamp: int) -> None:
        self.connection.execute(
            "INSERT OR IGNORE INTO evidence_items (id,user_id,source_type,source_id,claim_key,evidence_json,eligible_for_pattern,created_at) VALUES (?,?,?,?,?,?,?,?)",
            (evidence.evidence_id, evidence.user_id, evidence.source_type, evidence.source_id, evidence.claim_key, evidence.model_dump_json(), 1 if evidence.eligible_for_pattern else 0, timestamp),
        )

    def invalidate_source(self, *, user_id: str, source_type: str, source_id: str) -> None:
        self.connection.execute(
            "UPDATE behavior_events SET effective=0 WHERE user_id=? AND source_type=? AND source_id=?",
            (user_id, source_type, source_id),
        )
        self.connection.execute(
            "UPDATE evidence_items SET eligible_for_pattern=0 WHERE user_id=? AND source_type=? AND source_id=?",
            (user_id, source_type, source_id),
        )
