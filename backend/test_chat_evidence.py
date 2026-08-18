import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app.application.chat_evidence import project_chat_turn
from backend.humanos_server import Store


class ChatEvidenceAdapterTests(unittest.TestCase):
    def base_turn(self, **updates):
        turn = {
            "id": "turn-1", "user_id": "u", "created_at": 1_700_000_000_000,
            "user_text": "I feel tired and cannot focus", "assistant_reply": "You always struggle",
            "intent": "report_state", "task_ids": [], "timezone": "Europe/London",
            "local_time": "2026-08-18T09:15:00+01:00",
            "features": {
                "explicit_state": {"fatigue": True, "focus_difficulty": True, "stress": None},
                "evidence_span": "I feel tired and cannot focus",
                "hypotheses": [{"label": "possible_low_morning_energy", "confidence": "low", "persist_to_profile": True}],
                "extraction_provenance": "ai_model",
            },
        }
        turn.update(updates)
        return turn

    def test_assistant_reply_is_never_projected_as_user_data(self) -> None:
        event, evidence = project_chat_turn(
            event_id="behavior-1", explicit_evidence_id="evidence-1",
            hypothesis_evidence_id="evidence-2", turn=self.base_turn(),
        )
        serialized = f"{event.model_dump_json()} {[item.model_dump_json() for item in evidence]}"
        self.assertNotIn("You always struggle", serialized)
        self.assertEqual("I feel tired and cannot focus", event.after["user_text"])

    def test_explicit_span_is_medium_confidence_and_hypothesis_is_ineligible(self) -> None:
        _, evidence = project_chat_turn(
            event_id="behavior-1", explicit_evidence_id="evidence-1",
            hypothesis_evidence_id="evidence-2", turn=self.base_turn(),
        )
        explicit = next(item for item in evidence if item.claim_key == "chat.explicit_state")
        hypothesis = next(item for item in evidence if item.claim_key == "chat.hypotheses")
        self.assertTrue(explicit.user_explicit)
        self.assertEqual("medium", explicit.confidence_level)
        self.assertTrue(explicit.eligible_for_pattern)
        self.assertFalse(hypothesis.user_explicit)
        self.assertFalse(hypothesis.eligible_for_pattern)
        self.assertFalse(hypothesis.model_dump(mode="json")["structured_value"]["hypotheses"][0]["persist_to_profile"])

    def test_hallucinated_evidence_span_blocks_explicit_state_evidence(self) -> None:
        turn = self.base_turn(features={
            "explicit_state": {"stress": True},
            "evidence_span": "I am extremely stressed",
            "hypotheses": [], "extraction_provenance": "ai_model",
        })
        _, evidence = project_chat_turn(
            event_id="behavior-1", explicit_evidence_id="evidence-1",
            hypothesis_evidence_id="evidence-2", turn=turn,
        )
        self.assertEqual([], evidence)


class ChatEvidenceIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = Store(Path(self.temp.name) / "humanos.db")
        self.store.upsert_profile({"user_id": "u", "timezone": "Asia/Shanghai"})

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_turn_request_is_idempotent_and_profile_is_unchanged(self) -> None:
        features = {
            "explicit_state": {"fatigue": True, "stress": None},
            "evidence_span": "我很累", "hypotheses": [],
            "extraction_provenance": "local_rules",
        }
        before = self.store.get_profile("u")["learned_patterns"]
        first = self.store.save_chat_turn("u", "我很累", "我们缩小一步", "report_state", features, [], request_id="chat-1")
        second = self.store.save_chat_turn("u", "我很累", "different assistant text", "report_state", features, [], request_id="chat-1")
        evidence = self.store.list_personalization_evidence("u")
        behavior = [item for item in self.store.list_behavior_events("u") if item["source_type"] == "chat_turn"]
        self.assertEqual(first["id"], second["id"])
        self.assertTrue(second["replayed"])
        self.assertEqual(1, len(evidence))
        self.assertEqual(1, len(behavior))
        self.assertEqual(before, self.store.get_profile("u")["learned_patterns"])

    def test_feature_extraction_no_longer_writes_legacy_memory(self) -> None:
        features = self.store.extract_behavior_features("u", "我很累而且无法专注", local_only=True)
        with self.store.connect() as conn:
            count = conn.execute("SELECT COUNT(*) AS n FROM memories WHERE user_id='u' AND source_type='explicit_user_report'").fetchone()["n"]
        self.assertEqual("local_rules", features["extraction_provenance"])
        self.assertEqual(0, count)

    def test_background_chat_job_request_is_idempotent(self) -> None:
        payload = {"request_id": "job-request-1", "text": "hello"}
        with patch.object(self.store, "start_background_job"):
            first = self.store.create_background_job("u", "chat_parse", payload)
            second = self.store.create_background_job("u", "chat_parse", payload)
        self.assertEqual(first["job_id"], second["job_id"])
        with self.store.connect() as conn:
            count = conn.execute("SELECT COUNT(*) AS n FROM background_jobs WHERE user_id='u'").fetchone()["n"]
        self.assertEqual(1, count)


if __name__ == "__main__":
    unittest.main()
