"""Ordered, retryable projection of transactional outbox records."""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from app.application.chat_evidence import project_chat_turn
from app.application.context_dump_evidence import project_context_dump
from app.application.execution_evidence import project_execution_feedback, project_execution_transition
from app.application.plan_edit_evidence import project_plan_edit, project_plan_rationale
from app.application.pattern_decision_evidence import project_pattern_denial
from app.application.recommendation_feedback_evidence import project_recommendation_feedback
from app.application.state_checkin_evidence import project_state_checkin
from app.repositories.personalization import PersonalizationEvidenceRepository


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _project(repository: PersonalizationEvidenceRepository, kind: str, payload: dict[str, Any], timestamp: int) -> None:
    if kind == "plan_edit":
        behavior, evidence = project_plan_edit(
            event_id=_id("behavior"), evidence_id=_id("evidence"), **payload,
        )
        repository.save_behavior(event=behavior, timestamp=timestamp)
        repository.save_evidence(evidence=evidence, timestamp=timestamp)
    elif kind == "plan_rationale":
        evidence = project_plan_rationale(evidence_id=_id("evidence"), **payload)
        repository.save_evidence(evidence=evidence, timestamp=timestamp)
    elif kind == "execution_transition":
        behavior, evidence = project_execution_transition(
            event_id=_id("behavior"), evidence_id=_id("evidence"), **payload,
        )
        repository.save_behavior(event=behavior, timestamp=timestamp)
        repository.save_evidence(evidence=evidence, timestamp=timestamp)
    elif kind == "execution_feedback":
        evidence = project_execution_feedback(evidence_id=_id("evidence"), **payload)
        repository.save_evidence(evidence=evidence, timestamp=timestamp)
    elif kind == "state_checkin":
        behavior, evidence = project_state_checkin(
            event_id=_id("behavior"), evidence_id=_id("evidence"), **payload,
        )
        repository.save_behavior(event=behavior, timestamp=timestamp)
        repository.save_evidence(evidence=evidence, timestamp=timestamp)
    elif kind == "context_dump":
        behavior, evidence = project_context_dump(
            event_id=_id("behavior"), evidence_id=_id("evidence"), **payload,
        )
        repository.save_behavior(event=behavior, timestamp=timestamp)
        repository.save_evidence(evidence=evidence, timestamp=timestamp)
    elif kind == "chat_turn":
        behavior, evidence_items = project_chat_turn(
            event_id=_id("behavior"), explicit_evidence_id=_id("evidence"),
            hypothesis_evidence_id=_id("evidence"), **payload,
        )
        repository.save_behavior(event=behavior, timestamp=timestamp)
        for evidence in evidence_items:
            repository.save_evidence(evidence=evidence, timestamp=timestamp)
    elif kind == "recommendation_feedback":
        evidence = project_recommendation_feedback(evidence_id=_id("evidence"), **payload)
        repository.save_evidence(evidence=evidence, timestamp=timestamp)
    elif kind == "pattern_denial":
        evidence = project_pattern_denial(evidence_id=_id("evidence"), **payload)
        repository.save_evidence(evidence=evidence, timestamp=timestamp)
    elif kind == "invalidate_source":
        repository.invalidate_source(**payload)
    else:
        raise ValueError(f"Unsupported personalization outbox kind: {kind}")


def drain_personalization_outbox(connection: object, *, user_id: str) -> dict[str, int]:
    repository = PersonalizationEvidenceRepository(connection)
    processed = 0
    failed = 0
    while row := repository.next_pending(user_id=user_id):
        timestamp = int(time.time() * 1000)
        connection.execute("SAVEPOINT personalization_projection")
        try:
            _project(repository, str(row["kind"]), json.loads(row["payload_json"]), int(row["created_at"]))
            repository.mark_processed(outbox_id=str(row["id"]), timestamp=timestamp)
            connection.execute("RELEASE SAVEPOINT personalization_projection")
            processed += 1
        except Exception as exc:
            connection.execute("ROLLBACK TO SAVEPOINT personalization_projection")
            connection.execute("RELEASE SAVEPOINT personalization_projection")
            repository.mark_failed(outbox_id=str(row["id"]), error=f"{type(exc).__name__}: {exc}", timestamp=timestamp)
            failed += 1
            break
    return {"processed": processed, "failed": failed}
