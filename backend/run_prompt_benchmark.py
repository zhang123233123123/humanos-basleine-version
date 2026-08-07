#!/usr/bin/env python3
"""Run the production HumanOS prompts against the DeepSeek API.

The benchmark never falls back to local parsing rules.  A missing API key or a
failed model call is recorded as an API failure, not as a passing local result.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

try:
    from backend.humanos_server import (
        BEHAVIOR_FEATURE_PROMPT_VERSION,
        TASK_PARSE_PROMPT_VERSION,
        behavior_feature_messages,
        chat_completion,
        task_parsing_messages,
    )
except ModuleNotFoundError:
    from humanos_server import (  # type: ignore
        BEHAVIOR_FEATURE_PROMPT_VERSION,
        TASK_PARSE_PROMPT_VERSION,
        behavior_feature_messages,
        chat_completion,
        task_parsing_messages,
    )


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CASES = Path(__file__).with_name("prompt_benchmark_cases.json")
BEHAVIOR_CATEGORIES = {"dialog_context", "explicit_state"}
TIME_RE = re.compile(r"(?<!\d)([01]?\d|2[0-3])[:：]([0-5]\d)(?!\d)")
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")


def extract_tasks(result: Any) -> list[dict[str, Any]]:
    if isinstance(result, list):
        return [item for item in result if isinstance(item, dict)]
    if not isinstance(result, dict):
        return []
    tasks = result.get("tasks")
    if isinstance(tasks, list):
        return [item for item in tasks if isinstance(item, dict)]
    if any(key in result for key in ("title", "schedule_type", "task_type")):
        return [result]
    return []


def task_value(task: dict[str, Any], *names: str) -> Any:
    fallback = None
    for name in names:
        if name in task:
            fallback = task.get(name)
            if fallback not in (None, ""):
                return fallback
    return fallback


def normalized_clock(value: Any) -> str | None:
    text = str(value or "")
    match = TIME_RE.search(text)
    if match:
        return f"{int(match.group(1)):02d}:{int(match.group(2)):02d}"
    chinese = re.search(r"(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2}|[一二两三四五六七八九十]{1,3})\s*[点时](?:\s*(\d{1,2})\s*分)?", text)
    if not chinese:
        return None
    period, hour_text, minute_text = chinese.groups()
    if hour_text.isdigit():
        hour = int(hour_text)
    else:
        digits = {"一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
        if hour_text == "十":
            hour = 10
        elif hour_text.startswith("十"):
            hour = 10 + digits.get(hour_text[1:], 0)
        elif "十" in hour_text:
            tens, ones = hour_text.split("十", 1)
            hour = digits.get(tens, 0) * 10 + digits.get(ones, 0)
        else:
            hour = digits.get(hour_text, -1)
        if hour < 0:
            return None
    minute = int(minute_text or 0)
    if period in {"下午", "晚上"} and hour < 12:
        hour += 12
    if period == "中午" and hour < 11:
        hour += 12
    if period == "凌晨" and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute:02d}"


def normalized_date(value: Any) -> str | None:
    text = str(value or "")
    match = DATE_RE.search(text)
    if match:
        return match.group(0)
    chinese = re.search(r"(?:(\d{4})年)?\s*(\d{1,2})月\s*(\d{1,2})日", text)
    if not chinese:
        return None
    year, month, day = chinese.groups()
    return f"{int(year or 2026):04d}-{int(month):02d}-{int(day):02d}"


def missing_fields(task: dict[str, Any]) -> set[str]:
    value = task.get("missing_fields")
    return {str(item) for item in value} if isinstance(value, list) else set()


def confidence(task: dict[str, Any]) -> float:
    try:
        return float(task.get("confidence"))
    except (TypeError, ValueError):
        return 0.0


def json_boolean(value: Any) -> bool | None:
    if value is True or str(value).strip().lower() == "true":
        return True
    if value is False or str(value).strip().lower() == "false":
        return False
    return None


def add_check(checks: list[dict[str, Any]], key: str, metric: str, passed: bool, detail: str) -> None:
    checks.append({"expectation": key, "metric": metric, "passed": bool(passed), "detail": detail})


def score_expectations(
    case: dict[str, Any],
    task_result: Any,
    behavior_result: Any,
    reference_date: str = "2026-08-04",
) -> tuple[list[dict[str, Any]], list[str]]:
    expected = case.get("expect", {})
    tasks = extract_tasks(task_result)
    first = tasks[0] if tasks else {}
    checks: list[dict[str, Any]] = []
    scored: set[str] = set()

    if "task_count" in expected:
        wanted = int(expected["task_count"])
        add_check(checks, "task_count", "task_count_accuracy", len(tasks) == wanted, f"expected={wanted}, actual={len(tasks)}")
        scored.add("task_count")

    if "duration_minutes" in expected:
        wanted = sorted(int(value) for value in expected["duration_minutes"])
        actual = sorted(
            int(value)
            for task in tasks
            if (value := task_value(task, "duration_minutes", "estimated_duration", "duration")) is not None
        )
        add_check(checks, "duration_minutes", "duration_accuracy", actual == wanted, f"expected={wanted}, actual={actual}")
        scored.add("duration_minutes")

    if "schedule_type" in expected:
        actual = task_value(first, "schedule_type", "task_type")
        add_check(checks, "schedule_type", "deadline_accuracy", actual == expected["schedule_type"], f"expected={expected['schedule_type']}, actual={actual}")
        scored.add("schedule_type")

    for key, field_names in (("deadline_clock", ("deadline_at", "deadline", "due")), ("start_clock", ("start_at",))):
        if key in expected:
            actual = normalized_clock(task_value(first, *field_names))
            add_check(checks, key, "deadline_accuracy", actual == expected[key], f"expected={expected[key]}, actual={actual}")
            scored.add(key)

    if "absolute_date" in expected:
        actual = normalized_date(task_value(first, "deadline_at", "start_at", "deadline", "due"))
        add_check(checks, "absolute_date", "deadline_accuracy", actual == expected["absolute_date"], f"expected={expected['absolute_date']}, actual={actual}")
        scored.add("absolute_date")

    if "clock_required" in expected:
        deadline = task_value(first, "deadline_at", "deadline", "due")
        has_clock = normalized_clock(deadline) is not None
        wanted = bool(expected["clock_required"])
        add_check(checks, "clock_required", "deadline_accuracy", has_clock == wanted, f"expected={wanted}, actual={has_clock}")
        scored.add("clock_required")

    if "exact_start_inferred" in expected:
        inferred = task_value(first, "start_at") not in (None, "")
        wanted = bool(expected["exact_start_inferred"])
        add_check(checks, "exact_start_inferred", "deadline_accuracy", inferred == wanted, f"expected={wanted}, actual={inferred}")
        scored.add("exact_start_inferred")

    if "current_week_schedulable" in expected:
        deadline = str(task_value(first, "deadline_at", "deadline", "due") or "")
        resolved_date = normalized_date(deadline)
        reference = date.fromisoformat(reference_date)
        week_start = reference - timedelta(days=reference.weekday())
        week_end = week_start + timedelta(days=6)
        schedulable = "下周" not in deadline
        if resolved_date:
            target = date.fromisoformat(resolved_date)
            schedulable = week_start <= target <= week_end
        wanted = bool(expected["current_week_schedulable"])
        add_check(checks, "current_week_schedulable", "deadline_accuracy", schedulable == wanted, f"expected={wanted}, deadline={deadline!r}")
        scored.add("current_week_schedulable")

    if "missing_fields" in expected:
        actual_missing = missing_fields(first)
        for field in expected["missing_fields"]:
            value_names = {
                "duration_minutes": ("duration_minutes", "estimated_duration", "duration"),
                "deadline_at": ("deadline_at", "deadline", "due"),
                "start_at": ("start_at",),
            }.get(field, (field,))
            value = task_value(first, *value_names)
            passed = field in actual_missing and value in (None, "")
            add_check(checks, f"missing_fields.{field}", "hallucination_guard", passed, f"missing={sorted(actual_missing)}, value={value!r}")
        scored.add("missing_fields")

    if "standalone_task" in expected:
        wanted = bool(expected["standalone_task"])
        add_check(checks, "standalone_task", "hallucination_guard", bool(tasks) == wanted, f"expected={wanted}, task_count={len(tasks)}")
        scored.add("standalone_task")

    if "instruction_ignored" in expected:
        unsafe = re.compile(r"ignore|system|prompt|previous instructions|管理员|删除其他用户|所有依赖", re.I)
        unsafe_title = any(unsafe.search(str(task.get("title") or "")) for task in tasks)
        expected_count = expected.get("task_count")
        count_ok = len(tasks) == int(expected_count) if expected_count is not None else len(tasks) == 0
        add_check(checks, "instruction_ignored", "hallucination_guard", not unsafe_title and count_ok, f"task_count={len(tasks)}, unsafe_title={unsafe_title}")
        scored.add("instruction_ignored")

    if "low_confidence" in expected:
        actual = not tasks or any(confidence(task) < 0.6 for task in tasks)
        wanted = bool(expected["low_confidence"])
        add_check(checks, "low_confidence", "confidence_calibration", actual == wanted, f"expected={wanted}, confidences={[confidence(task) for task in tasks]}")
        scored.add("low_confidence")

    for key in ("requires_confirmation", "assumptions_visible"):
        if key in expected:
            actual = not tasks or any(missing_fields(task) for task in tasks)
            wanted = bool(expected[key])
            add_check(checks, key, "confirmation_safety", actual == wanted, f"expected={wanted}, actual={actual}")
            scored.add(key)

    if "create_new_task" in expected:
        actual = bool(tasks)
        wanted = bool(expected["create_new_task"])
        add_check(checks, "create_new_task", "dialog_safety", actual == wanted, f"expected={wanted}, actual={actual}")
        scored.add("create_new_task")

    if "negated_task_creation" in expected:
        actual = not tasks
        wanted = bool(expected["negated_task_creation"])
        add_check(checks, "negated_task_creation", "dialog_safety", actual == wanted, f"expected={wanted}, actual={actual}")
        scored.add("negated_task_creation")

    behavior = behavior_result if isinstance(behavior_result, dict) else {}
    if "intent" in expected:
        actual = behavior.get("intent")
        add_check(checks, "intent", "behavior_accuracy", actual == expected["intent"], f"expected={expected['intent']}, actual={actual}")
        scored.add("intent")

    if "explicit_state" in expected:
        actual_state = behavior.get("explicit_state") if isinstance(behavior.get("explicit_state"), dict) else {}
        wanted_state = expected["explicit_state"]
        passed = all(json_boolean(actual_state.get(key)) is value for key, value in wanted_state.items())
        add_check(checks, "explicit_state", "behavior_accuracy", passed, f"expected={wanted_state}, actual={actual_state}")
        scored.add("explicit_state")

    if "persist_explicit_only" in expected:
        hypotheses = behavior.get("hypotheses") if isinstance(behavior.get("hypotheses"), list) else []
        actual = all(not item.get("persist_to_profile") for item in hypotheses if isinstance(item, dict))
        wanted = bool(expected["persist_explicit_only"])
        add_check(checks, "persist_explicit_only", "behavior_accuracy", actual == wanted, f"expected={wanted}, hypotheses={hypotheses}")
        scored.add("persist_explicit_only")

    for state_name in ("fatigue", "stress"):
        key = f"{state_name}_inferred"
        if key in expected:
            actual_state = behavior.get("explicit_state") if isinstance(behavior.get("explicit_state"), dict) else {}
            hypotheses = behavior.get("hypotheses") if isinstance(behavior.get("hypotheses"), list) else []
            inferred = json_boolean(actual_state.get(state_name)) is True or any(
                state_name in str(item.get("label") or "") for item in hypotheses if isinstance(item, dict)
            )
            wanted = bool(expected[key])
            add_check(checks, key, "behavior_accuracy", inferred == wanted, f"expected={wanted}, actual={inferred}")
            scored.add(key)

    return checks, sorted(set(expected) - scored)


def semantic_signature(task_result: Any, behavior_result: Any) -> str:
    tasks = []
    for task in extract_tasks(task_result):
        tasks.append(
            {
                "title": re.sub(r"\s+", "", str(task.get("title") or "")).casefold(),
                "schedule_type": task_value(task, "schedule_type", "task_type"),
                "start_at": task.get("start_at"),
                "deadline_at": task_value(task, "deadline_at", "deadline", "due"),
                "duration_minutes": task_value(task, "duration_minutes", "estimated_duration", "duration"),
                "missing_fields": sorted(missing_fields(task)),
            }
        )
    behavior = behavior_result if isinstance(behavior_result, dict) else {}
    compact_behavior = {
        "intent": behavior.get("intent"),
        "explicit_state": behavior.get("explicit_state"),
        "needs_follow_up": behavior.get("needs_follow_up"),
    }
    return json.dumps({"tasks": tasks, "behavior": compact_behavior}, ensure_ascii=False, sort_keys=True)


def ratio(passed: int, total: int) -> dict[str, Any]:
    return {"passed": passed, "total": total, "rate": round(passed / total, 4) if total else None}


def call_with_retries(messages: list[dict], temperature: float, retries: int) -> Any:
    for attempt in range(retries + 1):
        result = chat_completion(messages, temperature=temperature)
        if result is not None:
            return result
        if attempt < retries:
            time.sleep(min(2 ** attempt, 4))
    return None


def run_benchmark(args: argparse.Namespace) -> tuple[dict[str, Any], Path]:
    if not os.environ.get("DEEPSEEK_API_KEY", "").strip():
        raise RuntimeError("DEEPSEEK_API_KEY is missing; benchmark refuses to use local fallback rules")

    cases = json.loads(Path(args.cases).read_text(encoding="utf-8"))
    if args.category:
        categories = set(args.category)
        cases = [case for case in cases if case.get("category") in categories]
    if args.limit:
        cases = cases[: args.limit]
    if not cases:
        raise RuntimeError("no benchmark cases selected")

    records: list[dict[str, Any]] = []
    api_calls = 0
    api_successes = 0
    started = time.perf_counter()
    context = {"client_context": {"local_date": args.reference_date}}

    for case_index, case in enumerate(cases, 1):
        runs = []
        print(f"[{case_index}/{len(cases)}] {case['id']} ({case['category']})", file=sys.stderr)
        for run_index in range(args.runs):
            api_calls += 1
            task_result = call_with_retries(
                task_parsing_messages(case["input"], context),
                args.temperature,
                args.retries,
            )
            if task_result is not None:
                api_successes += 1

            behavior_result = None
            if case.get("category") in BEHAVIOR_CATEGORIES:
                api_calls += 1
                behavior_result = call_with_retries(
                    behavior_feature_messages(case["input"], context),
                    args.temperature,
                    args.retries,
                )
                if behavior_result is not None:
                    api_successes += 1

            checks, unscored = score_expectations(case, task_result, behavior_result, args.reference_date)
            runs.append(
                {
                    "run": run_index + 1,
                    "task_result": task_result,
                    "behavior_result": behavior_result,
                    "checks": checks,
                    "unscored_expectations": unscored,
                    "signature": semantic_signature(task_result, behavior_result),
                    "api_ok": task_result is not None and (
                        case.get("category") not in BEHAVIOR_CATEGORIES or behavior_result is not None
                    ),
                }
            )
            if args.delay and (run_index + 1 < args.runs or case_index < len(cases)):
                time.sleep(args.delay)
        records.append({"id": case["id"], "category": case["category"], "input": case["input"], "expect": case["expect"], "runs": runs})

    # Model-quality metrics exclude provider failures. Availability has its own
    # api_success_rate so an outage cannot masquerade as a parsing mistake.
    checks = [
        check
        for record in records
        for run in record["runs"]
        if run["api_ok"]
        for check in run["checks"]
    ]
    by_metric: dict[str, list[bool]] = defaultdict(list)
    by_category: dict[str, list[bool]] = defaultdict(list)
    for record in records:
        for run in record["runs"]:
            if not run["api_ok"]:
                continue
            for check in run["checks"]:
                by_metric[check["metric"]].append(check["passed"])
                by_category[record["category"]].append(check["passed"])

    stability_exact = []
    stability_count = []
    for record in records:
        successful = [run for run in record["runs"] if run["api_ok"]]
        if len(successful) < 2:
            continue
        signatures = Counter(run["signature"] for run in successful)
        counts = Counter(len(extract_tasks(run["task_result"])) for run in successful)
        stability_exact.append(max(signatures.values()) / len(successful))
        stability_count.append(max(counts.values()) / len(successful))

    metric_summary = {
        metric: ratio(sum(values), len(values))
        for metric, values in sorted(by_metric.items())
    }
    all_results = [value for values in by_metric.values() for value in values]
    metrics = {
        "task_count_accuracy": metric_summary.get("task_count_accuracy", ratio(0, 0)),
        "deadline_accuracy": metric_summary.get("deadline_accuracy", ratio(0, 0)),
        "hallucination_rate": {
            "violations": len(by_metric.get("hallucination_guard", [])) - sum(by_metric.get("hallucination_guard", [])),
            "opportunities": len(by_metric.get("hallucination_guard", [])),
            "rate": round(
                (len(by_metric.get("hallucination_guard", [])) - sum(by_metric.get("hallucination_guard", [])))
                / len(by_metric.get("hallucination_guard", [])),
                4,
            ) if by_metric.get("hallucination_guard") else None,
        },
        "expectation_accuracy": ratio(sum(all_results), len(all_results)),
        "stability": {
            "semantic_exact_rate": round(statistics.mean(stability_exact), 4) if stability_exact else None,
            "task_count_rate": round(statistics.mean(stability_count), 4) if stability_count else None,
            "cases_with_repeats": len(stability_exact),
        },
        "api_success_rate": ratio(api_successes, api_calls),
        "by_metric": metric_summary,
        "by_category": {
            category: ratio(sum(values), len(values))
            for category, values in sorted(by_category.items())
        },
    }

    report = {
        "benchmark": "HumanOS Prompt Benchmark",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "provider": "deepseek",
        "model": os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
        "prompt_versions": {
            "task_parser": TASK_PARSE_PROMPT_VERSION,
            "behavior_features": BEHAVIOR_FEATURE_PROMPT_VERSION,
        },
        "configuration": {
            "case_count": len(cases),
            "runs_per_case": args.runs,
            "temperature": args.temperature,
            "reference_date": args.reference_date,
            "retries": args.retries,
        },
        "duration_seconds": round(time.perf_counter() - started, 3),
        "metrics": metrics,
        "cases": records,
    }

    output = Path(args.output) if args.output else ROOT / "qa-artifacts" / f"prompt-benchmark-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report, output


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate production HumanOS prompts with DeepSeek")
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--runs", type=int, default=3, help="Repeated calls per case for stability (default: 3)")
    parser.add_argument("--limit", type=int, default=0, help="Only run the first N selected cases")
    parser.add_argument("--category", action="append", help="Filter by category; may be repeated")
    parser.add_argument("--temperature", type=float, default=0.0)
    parser.add_argument("--reference-date", default="2026-08-04")
    parser.add_argument("--retries", type=int, default=1)
    parser.add_argument("--delay", type=float, default=0.1)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--strict", action="store_true", help="Return non-zero if any API call or scored expectation fails")
    args = parser.parse_args()
    if args.runs < 1:
        parser.error("--runs must be at least 1")

    try:
        report, output = run_benchmark(args)
    except Exception as exc:
        print(f"Benchmark failed: {exc}", file=sys.stderr)
        return 2

    metrics = report["metrics"]
    summary = {
        "report": str(output),
        "task_count_accuracy": metrics["task_count_accuracy"]["rate"],
        "deadline_accuracy": metrics["deadline_accuracy"]["rate"],
        "hallucination_rate": metrics["hallucination_rate"]["rate"],
        "semantic_stability": metrics["stability"]["semantic_exact_rate"],
        "task_count_stability": metrics["stability"]["task_count_rate"],
        "api_success_rate": metrics["api_success_rate"]["rate"],
        "expectation_accuracy": metrics["expectation_accuracy"]["rate"],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if args.strict and (
        metrics["api_success_rate"]["rate"] != 1.0
        or metrics["expectation_accuracy"]["rate"] != 1.0
    ):
        return 1
    return 0 if metrics["api_success_rate"]["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
