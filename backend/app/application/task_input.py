"""Normalize model-produced task facts before they enter HumanOS.

DeepSeek is responsible for understanding the user's language.  This module
does not invent missing facts; it only converts the model output into a stable
contract and adds an inspectable, deterministic content classification.
"""

from __future__ import annotations

from typing import Any

from ..domain.task.classifier import classify_task
from ..domain.task.models import ParsedTaskContract


def normalize_parsed_task_items(raw_items: list[Any], source_text: str) -> list[dict[str, Any]]:
    """Return valid, transport-safe task facts while preserving source order."""
    normalized: list[dict[str, Any]] = []
    for index, raw in enumerate(raw_items[:8]):
        if not isinstance(raw, dict):
            continue
        contract = ParsedTaskContract.from_mapping(raw, source_text=source_text)
        if not contract.title:
            continue
        classification = classify_task(contract.title, contract.context)
        item = contract.to_mapping()
        item["input_contract"] = {
            "version": "typed-task-input-v1",
            "valid": True,
            "source_index": index,
            "domain_type": classification.domain_type,
            "classification_rule": classification.rule_id,
        }
        normalized.append(item)
    return normalized

