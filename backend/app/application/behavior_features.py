"""Build deterministic behavior features when the feature agent is unavailable."""

from __future__ import annotations

from ..domain.intent import classify_intent


def local_behavior_features(text: str) -> dict:
    clean = text.strip()
    blockers: list[str] = []
    if any(word in clean for word in ["不知道", "不清楚", "模糊", "从哪"]):
        blockers.append("任务不清楚")
    if any(word in clean for word in ["累", "困", "没精力"]):
        blockers.append("疲劳")
    if any(word in clean for word in ["焦虑", "压力", "慌"]):
        blockers.append("焦虑")
    if any(word in clean for word in ["被打断", "临时打断", "消息打断"]):
        blockers.append("外部打断")
    if any(word in clean for word in ["回不来", "忘了", "上下文"]):
        blockers.append("上下文丢失")
    decision = classify_intent(clean)
    return {
        "intent": decision.intent,
        "intent_decision": decision.to_dict(),
        "planning_behavior": [],
        "blockers": blockers,
        "explicit_state": {
            "fatigue": True if any(word in clean for word in ["很累", "疲劳", "没精力"]) else None,
            "stress": True if any(word in clean for word in ["压力很大", "很焦虑", "很慌"]) else None,
            "focus_difficulty": True if any(word in clean for word in ["无法专注", "集中不了"]) else None,
        },
        "evidence_span": clean if blockers else None,
        "hypotheses": [],
        "needs_follow_up": bool(blockers),
    }
