import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import backend.humanos_server as server_module
from backend.app.domain.personalization import EvidenceScope, ProfileTrait
from backend.humanos_server import Handler, Store


class ScheduleTraitIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = Store(Path(self.temp_dir.name) / "schedule-traits.db")
        self.store.upsert_profile({
            "user_id": "u", "timezone": "Asia/Shanghai", "role": "student",
            "active_week_id": "2026-08-03", "task_preferences": {"preferred_session_minutes": 45, "rest_between_tasks_minutes": 15},
            "weekly_context": {
                "week_id": "2026-08-03",
                "weekly_available_windows": "周二 09:00-10:00；周二 14:00-15:00",
                "context_items": [], "fixed_events": [], "temporary_constraints": [], "keep_buffer": False,
            },
        })
        self.task = self.store.create_task("u", {
            "title": "Analyze interviews", "task_type": "flexible_task", "duration": 45,
            "priority": "high", "expected_difficulty": 6, "due": "周二 18:00", "week_id": "2026-08-03",
        })

    def tearDown(self):
        self.temp_dir.cleanup()

    def insert_trait(self, *, status="confirmed"):
        trait = ProfileTrait(
            trait_id="trait-afternoon-energy", user_id="u", trait_key="perceived_state.energy",
            value={"field": "energy", "band": "high", "typical_value": 6, "daypart": "afternoon"},
            scope=EvidenceScope(temporal_context={"daypart": "afternoon", "timezone": "Asia/Shanghai"}),
            evidence_ids=("e1", "e2", "e3", "e4", "e5"), confidence_level="high",
            status=status, user_confirmed=True, confirmed_at=1_700_000_000_000,
            updated_at=1_700_000_000_000, source_candidate_id="candidate-afternoon-energy",
        )
        with self.store.connect() as conn:
            conn.execute(
                "INSERT INTO profile_traits (id,user_id,candidate_id,trait_key,trait_json,status,confirmed_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
                (trait.trait_id, "u", "candidate-afternoon-energy", trait.trait_key, trait.model_dump_json(), status, trait.confirmed_at, trait.updated_at),
            )
        return trait

    def decide(self, **payload):
        with patch("backend.humanos_server.chat_completion", return_value=None):
            return self.store.decide_schedule("u", {
                "week_id": "2026-08-03", "request_id": payload.pop("request_id", "schedule-traits-1"),
                **payload,
            })

    def task_block(self, decision):
        return next(item for item in decision["plan_patch"] if item.get("task_id") == self.task["id"])

    def test_confirmed_trait_flows_from_database_into_persisted_draft(self):
        self.insert_trait()
        decision = self.decide(runtime_state={"source": "default", "focus": 4, "energy": 4, "stress": 4})

        self.assertEqual(14.0, self.task_block(decision)["start"])
        self.assertEqual(["trait-afternoon-energy"], decision["personalization"]["applied_trait_ids"])
        self.assertEqual({
            "trait_id": "trait-afternoon-energy", "trait_key": "perceived_state.energy",
            "daypart": "afternoon", "band": "high", "confidence_level": "high",
            "evidence_count": 5, "authority": "weak_prior",
        }, decision["personalization"]["applied_traits"][0])
        self.assertEqual(["trait-afternoon-energy"], decision["profile_snapshot"]["applied_profile_trait_ids"])

        persisted = self.store.latest_proposed_plan("u", "2026-08-03")
        self.assertEqual(decision["plan_id"], persisted["plan_id"])
        self.assertEqual(["trait-afternoon-energy"], persisted["profile_snapshot"]["applied_profile_trait_ids"])
        self.assertEqual(decision["plan_id"], self.decide(request_id="schedule-traits-1")["plan_id"])

    def test_http_schedule_endpoint_returns_trait_audit_contract(self):
        self.insert_trait()
        response = {}
        handler = object.__new__(Handler)
        handler.command = "POST"
        handler.path = "/api/schedules/decide"
        handler.read_json = lambda: {
            "user_id": "u", "week_id": "2026-08-03", "request_id": "http-trait",
            "runtime_state": {"source": "default", "focus": 4, "energy": 4, "stress": 4},
        }
        handler.send_json = lambda body, status=200: response.update({"body": body, "status": status})
        with patch.object(server_module, "store", self.store), patch.object(server_module, "chat_completion", return_value=None):
            handler.route()

        self.assertEqual(200, response["status"])
        decision = response["body"]["decision"]
        self.assertEqual("proposed", decision["plan_status"])
        self.assertEqual(["trait-afternoon-energy"], decision["personalization"]["applied_trait_ids"])
        self.assertEqual(["trait-afternoon-energy"], decision["profile_snapshot"]["applied_profile_trait_ids"])

    def test_current_self_report_suppresses_long_term_trait_for_today(self):
        self.insert_trait()
        decision = self.decide(
            request_id="current-state",
            runtime_state={"source": "self_report", "focus": 2, "energy": 2, "stress": 6},
        )

        self.assertEqual(9.0, self.task_block(decision)["start"])
        self.assertEqual([], decision["personalization"]["applied_trait_ids"])
        self.assertTrue(decision["personalization"]["today_state_overrode_traits"])

    def test_forgotten_trait_is_not_loaded_into_schedule(self):
        self.insert_trait(status="forgotten")
        decision = self.decide(request_id="forgotten")

        self.assertEqual(9.0, self.task_block(decision)["start"])
        self.assertEqual([], decision["personalization"]["available_trait_ids"])
        self.assertEqual([], decision["profile_snapshot"]["applied_profile_trait_ids"])

    def test_confirmed_plan_session_and_feedback_preserve_trait_attribution(self):
        self.insert_trait()
        decision = self.decide(
            request_id="effect-plan",
            runtime_state={"source": "default", "focus": 4, "energy": 4, "stress": 4},
        )
        block = self.task_block(decision)
        self.assertEqual(["trait-afternoon-energy"], block["applied_profile_trait_ids"])
        with self.store.connect() as conn:
            before_trait = conn.execute(
                "SELECT trait_json FROM profile_traits WHERE id='trait-afternoon-energy'"
            ).fetchone()["trait_json"]

        self.store.confirm_plan("u", {
            "plan_id": decision["plan_id"], "week_id": "2026-08-03",
            "edit_episode_id": decision["edit_episode_id"], "plan_patch": decision["plan_patch"],
            "unscheduled_tasks": decision.get("unscheduled_tasks") or [],
            "ai_task_analysis": decision.get("ai_task_analysis") or {}, "decision": decision,
        })
        session = self.store.list_execution_sessions("u")[0]
        self.assertEqual(["trait-afternoon-energy"], session["profile_trait_refs"])

        started = self.store.start_execution_session("u", {"execution_session_id": session["execution_session_id"], "request_id": "effect-start"})
        self.store.end_execution_session("u", {"execution_session_id": started["execution_session_id"], "actual_minutes": 45, "request_id": "effect-end"})
        feedback_payload = {
            "task_id": self.task["id"], "execution_session_id": session["execution_session_id"],
            "request_id": "effect-feedback", "task_evaluation": {"completion": "completed", "actual_minutes": 45},
            "state_evaluation": {"energy_after": 4}, "recommendation_evaluation": {"timing_fit": "helpful"},
        }
        first = self.store.save_execution_feedback("u", feedback_payload)
        replay = self.store.save_execution_feedback("u", feedback_payload)
        self.assertEqual(["trait-afternoon-energy"], first["profile_trait_refs"])
        self.assertEqual(first["id"], replay["id"])

        outcomes = [item for item in self.store.list_personalization_evidence("u") if item["claim_key"] == "profile_trait.execution_outcome"]
        self.assertEqual(1, len(outcomes))
        self.assertEqual("trait-afternoon-energy", outcomes[0]["structured_value"]["profile_trait_id"])
        self.assertFalse(outcomes[0]["eligible_for_pattern"])
        with self.store.connect() as conn:
            after_trait = conn.execute("SELECT trait_json FROM profile_traits WHERE id='trait-afternoon-energy'").fetchone()["trait_json"]
        self.assertEqual(before_trait, after_trait)

    def test_confirmation_rejects_fabricated_trait_attribution(self):
        decision = self.decide(request_id="fabricated-plan")
        decision["plan_patch"][0]["applied_profile_trait_ids"] = ["trait-does-not-exist"]
        self.store.confirm_plan("u", {
            "plan_id": decision["plan_id"], "week_id": "2026-08-03",
            "edit_episode_id": decision["edit_episode_id"], "plan_patch": decision["plan_patch"],
            "unscheduled_tasks": decision.get("unscheduled_tasks") or [],
            "ai_task_analysis": decision.get("ai_task_analysis") or {}, "decision": decision,
        })
        session = self.store.list_execution_sessions("u")[0]
        self.assertEqual([], session["profile_trait_refs"])


if __name__ == "__main__":
    unittest.main()
