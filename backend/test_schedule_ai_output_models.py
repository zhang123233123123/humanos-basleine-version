import unittest
from unittest.mock import patch

from pydantic import ValidationError

from backend.app.domain.planning.ai_outputs import ScheduleComparisonOutput, SchedulePlannerOutput
from backend.humanos_server import typed_chat_completion


def valid_block() -> dict:
    return {
        "task_id": "task-1",
        "day_index": 2,
        "start": 9.0,
        "end": 9.75,
        "reason": "Before the deadline in an available window.",
        "capacity_fit": "ideal",
        "capacity_evidence": ["Profile morning baseline"],
        "capacity_tradeoff": None,
        "parallel_group_id": None,
        "parallel_role": None,
    }


def valid_planner_output() -> dict:
    return {
        "candidate_plans": [{
            "id": "deadline_guard",
            "label": "Deadline guard",
            "rationale": "Protect the earliest deadline.",
            "override_reason": None,
            "state_decision": {
                "state_used": {"focus": 6, "energy": 5, "stress": 3},
                "affected_decision": "next_session_selection",
                "result": "Selected demanding work first today.",
            },
            "blocks": [valid_block()],
            "unallocated": [],
        }],
        "selected_candidate_id": "deadline_guard",
        "evidence": ["Earliest deadline first"],
        "confidence_level": "high",
        "warnings": [],
    }


class ScheduleAIOutputModelTests(unittest.TestCase):
    def test_accepts_well_typed_planner_output(self) -> None:
        result = SchedulePlannerOutput.model_validate(valid_planner_output())
        self.assertEqual("task-1", result.candidate_plans[0].blocks[0].task_id)

    def test_rejects_non_grid_time(self) -> None:
        payload = valid_planner_output()
        payload["candidate_plans"][0]["blocks"][0]["start"] = 9.1
        with self.assertRaises(ValidationError):
            SchedulePlannerOutput.model_validate(payload)

    def test_rejects_unknown_extra_output_fields(self) -> None:
        payload = valid_planner_output()
        payload["model_commentary"] = "silently ignored before typing"
        with self.assertRaises(ValidationError):
            SchedulePlannerOutput.model_validate(payload)

    def test_selected_candidate_must_exist(self) -> None:
        payload = valid_planner_output()
        payload["selected_candidate_id"] = "invented"
        with self.assertRaises(ValidationError):
            SchedulePlannerOutput.model_validate(payload)

    def test_parallel_fields_must_be_complete(self) -> None:
        payload = valid_planner_output()
        payload["candidate_plans"][0]["blocks"][0]["parallel_group_id"] = "pair-1"
        with self.assertRaises(ValidationError):
            SchedulePlannerOutput.model_validate(payload)

    def test_comparison_has_closed_schema(self) -> None:
        result = ScheduleComparisonOutput.model_validate({
            "explanation": "Candidate A protects the deadline.",
            "first_action": "Open the transcript.",
            "risk": "The remaining buffer is small.",
            "selected_candidate_id": "deadline_guard",
            "constraint_interpretation": [],
            "task_demand_review": [],
            "task_dependencies": [],
            "repair_suggestions": [],
            "evidence": ["Validated metrics"],
            "confidence_level": "medium",
            "warnings": [],
        })
        self.assertEqual("deadline_guard", result.selected_candidate_id)

    def test_typed_completion_retries_once_with_schema_feedback(self) -> None:
        invalid = {"candidate_plans": [], "selected_candidate_id": "missing"}
        with patch("backend.humanos_server.chat_completion", side_effect=[invalid, valid_planner_output()]) as completion:
            result = typed_chat_completion(
                [{"role": "user", "content": "schedule"}],
                SchedulePlannerOutput,
                "test_planner",
            )
        self.assertEqual("deadline_guard", result["selected_candidate_id"])
        self.assertEqual(2, completion.call_count)
        initial_messages = completion.call_args_list[0].args[0]
        self.assertIn("json_schema", initial_messages[0]["content"])
        self.assertIn("test_planner-v1", initial_messages[0]["content"])
        retry_messages = completion.call_args_list[1].args[0]
        self.assertIn("validation_errors", retry_messages[-1]["content"])

    def test_typed_completion_stops_after_one_failed_retry(self) -> None:
        invalid = {"candidate_plans": [], "selected_candidate_id": "missing"}
        with patch("backend.humanos_server.chat_completion", side_effect=[invalid, invalid]) as completion:
            result = typed_chat_completion([], SchedulePlannerOutput, "test_planner")
        self.assertIsNone(result)
        self.assertEqual(2, completion.call_count)


if __name__ == "__main__":
    unittest.main()
