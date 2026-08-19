"""Task resource tags and attention compatibility.

This module deliberately knows nothing about persistence, prompts, or plans.
Resource tags describe occupied channels; they are not energy measurements.
"""

from __future__ import annotations

from typing import Literal

ResourceTag = Literal["visual", "auditory", "verbal", "motor"]
AttentionMode = Literal["continuous", "intermittent", "passive"]

RESOURCE_TAGS = frozenset({"visual", "auditory", "verbal", "motor"})
ATTENTION_MODES = frozenset({"continuous", "intermittent", "passive"})

_TAG_ALIASES = {
    "视觉": "visual",
    "听觉": "auditory",
    "语言": "verbal",
    "language": "verbal",
    "手部": "motor",
    "肢体": "motor",
    "行动": "motor",
    "动作": "motor",
    "manual": "motor",
    "mobility": "motor",
}


def require_valid_resource_tags(value: object) -> None:
    raw = value if isinstance(value, list) else [value] if value else []
    unsupported = []
    for item in raw:
        text = str(item).strip().lower()
        if _TAG_ALIASES.get(text, text) not in RESOURCE_TAGS:
            unsupported.append(str(item))
    if unsupported:
        raise ValueError(f"Unsupported resource tags: {', '.join(unsupported)}")


def require_valid_attention_mode(value: object) -> None:
    if str(value or "").strip().lower() not in ATTENTION_MODES:
        raise ValueError("attention_mode must be continuous, intermittent, or passive")


def normalize_resource_tags(value: object) -> list[ResourceTag]:
    raw = value if isinstance(value, list) else [value] if value else []
    normalized: list[ResourceTag] = []
    for item in raw:
        text = str(item).strip().lower()
        tag = _TAG_ALIASES.get(text, text)
        if tag in RESOURCE_TAGS and tag not in normalized:
            normalized.append(tag)  # type: ignore[arg-type]
    return normalized


def normalize_attention_mode(value: object, default: AttentionMode = "continuous") -> AttentionMode:
    mode = str(value or "").strip().lower()
    return mode if mode in ATTENTION_MODES else default  # type: ignore[return-value]


def parallel_compatibility(primary: dict, secondary: dict) -> tuple[bool, str]:
    """Return whether two task profiles are eligible for a user-confirmed overlap."""
    if not primary.get("parallelizable") or not secondary.get("parallelizable"):
        return False, "Both tasks must be explicitly marked as eligible for a parallel suggestion."
    first_tags = set(normalize_resource_tags(primary.get("resource_modality")))
    second_tags = set(normalize_resource_tags(secondary.get("resource_modality")))
    if not first_tags or not second_tags:
        return False, "The resource tags are not specific enough to validate this pair."

    shared = first_tags & second_tags
    if shared:
        return False, f"The activities compete for: {', '.join(sorted(shared))}."

    first_attention = normalize_attention_mode(primary.get("attention_mode"))
    second_attention = normalize_attention_mode(secondary.get("attention_mode"))
    if first_attention == second_attention == "continuous":
        return False, "Two continuously attended activities cannot run in parallel."

    return True, "The tasks use separate resource tags and at most one requires continuous attention."
