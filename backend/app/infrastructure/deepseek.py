"""DeepSeek model construction isolated from domain and application code."""

from __future__ import annotations

import os

from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider


def deepseek_available() -> bool:
    return bool(os.environ.get("DEEPSEEK_API_KEY", "").strip())


def build_deepseek_model() -> OpenAIChatModel | None:
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        return None
    base_url = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    return OpenAIChatModel(
        os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
        provider=OpenAIProvider(base_url=base_url, api_key=api_key),
    )
