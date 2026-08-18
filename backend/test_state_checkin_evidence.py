import tempfile
import unittest
from pathlib import Path

from backend.app.application.state_checkin_evidence import project_state_checkin
from backend.humanos_server import Store


class StateCheckinEvidenceAdapterTests(unittest.TestCase):
    def test_projection_preserves_missingness_and_local_time_context(self) -> None:
        event, evidence = project_state_checkin(
            event_id="event-1",
            evidence_id="evidence-1",
            checkin={
                "id": "state-1",
                "user_id": "u",
                "created_at": 1_700_000_000_000,
                "timezone": "Asia/Shanghai",
                "local_time": "2026-08-18T14:25:00+08:00",
                "daily_checkin": True,
                "submitted_fields": {"energy": 5, "daily_note": "slept late"},
            },
        )
        value = evidence.model_dump(mode="json")["structured_value"]
        temporal = evidence.model_dump(mode="json")["scope"]["temporal_context"]
        self.assertEqual({"energy": 5, "daily_note": "slept late"}, value["values"])
        self.assertEqual(["energy", "daily_note"], value["reported_fields"])
        self.assertIn("focus", value["missing_fields"])
        self.assertNotIn("focus", event.model_dump(mode="json")["after"])
        self.assertEqual("2026-08-18", temporal["local_date"])
        self.assertEqual("afternoon", temporal["daypart"])
        self.assertEqual("+0800", temporal["utc_offset"])

    def test_empty_submission_is_not_pattern_eligible(self) -> None:
        _, evidence = project_state_checkin(
            event_id="event-1", evidence_id="evidence-1",
            checkin={
                "id": "state-1", "user_id": "u", "created_at": 1,
                "timezone": "UTC", "local_time": "2026-08-18T02:00:00+00:00",
                "submitted_fields": {},
            },
        )
        self.assertFalse(evidence.user_explicit)
        self.assertFalse(evidence.eligible_for_pattern)
        self.assertEqual("night", evidence.scope.temporal_context["daypart"])


class StateCheckinEvidenceIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = Store(Path(self.temp.name) / "humanos.db")
        self.store.upsert_profile({"user_id": "u", "timezone": "Asia/Shanghai"})

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_save_enqueues_one_projection_and_does_not_change_learned_profile(self) -> None:
        before = self.store.get_profile("u")["learned_patterns"]
        state = self.store.save_runtime_state("u", {
            "request_id": "checkin-1", "energy": 5, "stress": 2,
            "daily_note": "clear morning", "source": "daily_checkin",
        })
        evidence = self.store.list_personalization_evidence("u")
        after = self.store.get_profile("u")["learned_patterns"]
        self.assertEqual(1, len(evidence))
        self.assertEqual(state["id"], evidence[0]["source_id"])
        self.assertEqual({"energy": 5, "stress": 2, "daily_note": "clear morning"}, evidence[0]["structured_value"]["values"])
        self.assertEqual(before, after)

    def test_request_replay_does_not_duplicate_state_or_evidence(self) -> None:
        payload = {"request_id": "same-checkin", "focus": 6}
        first = self.store.save_runtime_state("u", payload)
        second = self.store.save_runtime_state("u", payload)
        with self.store.connect() as conn:
            state_count = conn.execute("SELECT COUNT(*) AS n FROM runtime_states WHERE user_id='u'").fetchone()["n"]
            outbox_count = conn.execute("SELECT COUNT(*) AS n FROM personalization_outbox WHERE user_id='u'").fetchone()["n"]
        self.assertEqual(first["id"], second["id"])
        self.assertTrue(second["replayed"])
        self.assertEqual(1, state_count)
        self.assertEqual(1, outbox_count)
        self.assertEqual(1, len(self.store.list_personalization_evidence("u")))


if __name__ == "__main__":
    unittest.main()
