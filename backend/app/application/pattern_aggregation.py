"""Deterministic, evidence-traceable aggregation into unconfirmed candidates."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from statistics import median
from typing import Any
from zoneinfo import ZoneInfo

from app.domain.personalization import EvidenceScope, PatternCandidate


CANDIDATE_SUPPORT_THRESHOLD = 3
CANDIDATE_DAY_THRESHOLD = 2
CANDIDATE_RATIO_THRESHOLD = 2 / 3
SUGGEST_SUPPORT_THRESHOLD = 5
SUGGEST_DAY_THRESHOLD = 3
SUGGEST_RATIO_THRESHOLD = 0.70


@dataclass(frozen=True)
class PatternSignal:
    evidence_id: str
    trait_key: str
    value_key: str
    proposed_value: dict[str, Any]
    label: str
    scope: EvidenceScope
    local_date: str


def _daypart(hour: int) -> str:
    if hour < 6:
        return "night"
    if hour < 12:
        return "morning"
    if hour < 18:
        return "afternoon"
    return "evening"


def _local_date(evidence: dict[str, Any], timezone_name: str) -> str:
    temporal = dict((evidence.get("scope") or {}).get("temporal_context") or {})
    if temporal.get("local_date"):
        return str(temporal["local_date"])
    return datetime.fromtimestamp(int(evidence["observed_at"]) / 1000, tz=ZoneInfo(timezone_name)).date().isoformat()


def _normalized_scope(evidence: dict[str, Any], *, add_daypart: bool = False) -> EvidenceScope:
    raw = dict(evidence.get("scope") or {})
    temporal = dict(raw.pop("temporal_context", {}) or {})
    normalized_temporal = {
        key: temporal[key]
        for key in ("timezone", "daypart", "checkpoint_type")
        if temporal.get(key) is not None
    }
    if add_daypart and "daypart" not in normalized_temporal and temporal.get("local_hour") is not None:
        normalized_temporal["daypart"] = _daypart(int(temporal["local_hour"]))
    return EvidenceScope(**raw, temporal_context=normalized_temporal)


def _scope_suffix(scope: EvidenceScope) -> str:
    if scope.task_id:
        return f"@task:{scope.task_id}"
    if scope.context_item_id:
        return f"@context:{scope.context_item_id}"
    return ""


def _scalar(value: Any) -> bool:
    return isinstance(value, (str, bool, int, float)) and not isinstance(value, complex)


def _signals_for(evidence: dict[str, Any], timezone_name: str) -> list[PatternSignal]:
    evidence_id = str(evidence["evidence_id"])
    claim = str(evidence.get("claim_key") or "")
    structured = dict(evidence.get("structured_value") or {})
    local_date = _local_date(evidence, timezone_name)
    signals: list[PatternSignal] = []

    def add(trait: str, value: object, proposed: dict[str, Any], label: str, scope: EvidenceScope) -> None:
        signals.append(PatternSignal(evidence_id, trait, json.dumps(value, sort_keys=True, ensure_ascii=False), proposed, label, scope, local_date))

    if claim == "state_checkin.self_report":
        scope = _normalized_scope(evidence)
        daypart = str(scope.temporal_context.get("daypart") or "unknown")
        for field, raw in dict(structured.get("values") or {}).items():
            if field in {"energy", "focus", "stress"} and isinstance(raw, (int, float)) and not isinstance(raw, bool):
                band = "low" if raw <= 3 else "high" if raw >= 5 else "typical"
                add(f"perceived_state.{field}", band, {"field": field, "band": band, "typical_value": raw, "daypart": daypart}, f"state:{daypart}:{field}:{band}", scope)
            elif field in {"mood", "emotion", "readiness"} and _scalar(raw) and str(raw).strip():
                value = str(raw).strip().lower()
                add(f"perceived_state.{field}", value, {"field": field, "value": value, "daypart": daypart}, f"state:{daypart}:{field}:{value}", scope)
    elif claim == "chat.explicit_state":
        scope = _normalized_scope(evidence, add_daypart=True)
        daypart = str(scope.temporal_context.get("daypart") or "unknown")
        for field, raw in dict(structured.get("explicit_state") or {}).items():
            if isinstance(raw, bool):
                value = "present" if raw else "absent"
                add(f"reported_state.{field}", value, {"field": field, "value": value, "daypart": daypart}, f"chat_state:{daypart}:{field}:{value}", scope)
    elif claim == "recommendation_feedback.outcome":
        scope = _normalized_scope(evidence)
        label = str(structured.get("pattern_label") or "").strip()
        if label:
            add("recommendation_response", label, {"pattern_label": label, **structured}, label + _scope_suffix(scope), scope)
    elif claim == "context_dump.reentry_checkpoint":
        scope = _normalized_scope(evidence)
        reason = str(dict(structured.get("values") or {}).get("stop_reason") or "").strip().lower()
        if reason:
            add("reentry.stop_reason", reason, {"stop_reason": reason}, f"reentry:stop_reason:{reason}{_scope_suffix(scope)}", scope)
    elif claim == "schedule_edit.rationale":
        scope = _normalized_scope(evidence)
        for reason in sorted({str(item).strip().lower() for item in structured.get("reason_codes") or [] if str(item).strip()}):
            add("schedule_edit.rationale", reason, {"reason_code": reason}, f"schedule_edit:rationale:{reason}{_scope_suffix(scope)}", scope)
    elif claim == "schedule_behavior.move_session":
        scope = _normalized_scope(evidence)
        before = dict(structured.get("before") or {})
        after = dict(structured.get("after") or {})
        before_position = float(before.get("day_index", 0)) * 24 + float(before.get("start", 0))
        after_position = float(after.get("day_index", 0)) * 24 + float(after.get("start", 0))
        direction = "later" if after_position > before_position else "earlier" if after_position < before_position else "unchanged"
        if direction != "unchanged":
            add("schedule_edit.time_direction", direction, {"direction": direction}, f"schedule_edit:time:{direction}{_scope_suffix(scope)}", scope)
    elif claim == "execution_feedback.outcome":
        scope = _normalized_scope(evidence)
        for section in ("task_evaluation", "state_evaluation", "recommendation_evaluation"):
            for field, raw in dict(structured.get(section) or {}).items():
                if _scalar(raw) and str(raw).strip():
                    value = str(raw).strip().lower()
                    trait = f"execution_feedback.{section}.{field}"
                    add(trait, value, {"section": section, "field": field, "value": value}, f"{trait}:{value}{_scope_suffix(scope)}", scope)
    return signals


def build_evidence_pattern_candidates(
    evidence_items: list[dict[str, Any]], *, user_id: str, timezone_name: str,
) -> list[dict[str, Any]]:
    denials: dict[str, list[tuple[str, str]]] = {}
    for evidence in evidence_items:
        if evidence.get("claim_key") != "pattern_decision.denied":
            continue
        candidate_id = str(dict(evidence.get("structured_value") or {}).get("candidate_id") or "")
        if candidate_id:
            denials.setdefault(candidate_id, []).append((str(evidence["evidence_id"]), _local_date(evidence, timezone_name)))
    signals = [
        signal
        for evidence in evidence_items
        if evidence.get("eligible_for_pattern")
        for signal in _signals_for(evidence, timezone_name)
    ]
    groups: dict[tuple[str, str], list[PatternSignal]] = {}
    for signal in signals:
        scope_json = json.dumps(signal.scope.model_dump(mode="json"), sort_keys=True, ensure_ascii=False)
        groups.setdefault((signal.trait_key, scope_json), []).append(signal)

    result = []
    for (trait_key, scope_json), scoped_signals in groups.items():
        scope = EvidenceScope(**json.loads(scope_json))
        values = sorted({signal.value_key for signal in scoped_signals})
        for value_key in values:
            support = [signal for signal in scoped_signals if signal.value_key == value_key]
            counters = [signal for signal in scoped_signals if signal.value_key != value_key]
            support_ids = tuple(dict.fromkeys(signal.evidence_id for signal in support))
            support_id_set = set(support_ids)
            counter_ids = tuple(dict.fromkeys(signal.evidence_id for signal in counters if signal.evidence_id not in support_id_set))
            sample_size = len(support_ids) + len(counter_ids)
            support_days = {signal.local_date for signal in support}
            all_days = {signal.local_date for signal in support + counters}
            ratio = len(support_ids) / sample_size if sample_size else 0.0
            candidate_ready = len(support_ids) >= CANDIDATE_SUPPORT_THRESHOLD and len(support_days) >= CANDIDATE_DAY_THRESHOLD and ratio >= CANDIDATE_RATIO_THRESHOLD
            suggest_ready = len(support_ids) >= SUGGEST_SUPPORT_THRESHOLD and len(support_days) >= SUGGEST_DAY_THRESHOLD and ratio >= SUGGEST_RATIO_THRESHOLD
            base_proposed = dict(support[0].proposed_value)
            numeric_values = [item.proposed_value.get("typical_value") for item in support if isinstance(item.proposed_value.get("typical_value"), (int, float))]
            if numeric_values:
                base_proposed["typical_value"] = median(numeric_values)
            base_proposed.update({"support_ratio": round(ratio, 3), "support_day_count": len(support_days)})
            identity = json.dumps({"trait": trait_key, "value": value_key, "scope": json.loads(scope_json)}, sort_keys=True, ensure_ascii=False)
            candidate_id = f"candidate_{hashlib.sha256(identity.encode('utf-8')).hexdigest()[:20]}"
            denial_items = denials.get(candidate_id, [])
            denial_ids = tuple(item[0] for item in denial_items if item[0] not in support_id_set and item[0] not in counter_ids)
            counter_ids = counter_ids + denial_ids
            sample_size = len(support_ids) + len(counter_ids)
            all_days.update(item[1] for item in denial_items)
            ratio = len(support_ids) / sample_size if sample_size else 0.0
            denied = bool(denial_ids)
            candidate_ready = candidate_ready and not denied
            suggest_ready = suggest_ready and not denied
            base_proposed["support_ratio"] = round(ratio, 3)
            candidate = PatternCandidate(
                candidate_id=candidate_id,
                user_id=user_id,
                trait_key=trait_key,
                proposed_value=base_proposed,
                scope=scope,
                supporting_evidence_ids=support_ids,
                counter_evidence_ids=counter_ids,
                sample_size=sample_size,
                evidence_day_count=len(all_days),
                confidence_level="high" if suggest_ready else "medium" if candidate_ready else "low",
                status="dismissed" if denied else "candidate" if candidate_ready else "insufficient_evidence",
            ).model_dump(mode="json")
            candidate.update({
                "pattern_label": support[0].label,
                "episode_count": len(support_ids),
                "counter_evidence_count": len(counter_ids),
                "support_ratio": round(ratio, 3),
                "support_day_count": len(support_days),
                "can_suggest_update": suggest_ready,
                "evidence_role": "profile_learning_evidence",
                "user_confirmed": False,
                "plan_write_allowed": False,
            })
            result.append(candidate)
    return sorted(result, key=lambda item: (-item["episode_count"], item["pattern_label"]))
