import tempfile
import time
import unittest
import json
from pathlib import Path
from unittest.mock import patch

import backend.humanos_server as server_module
from backend.app.domain.personalization import EvidenceItem, EvidenceScope
from backend.app.repositories.personalization import PersonalizationEvidenceRepository
from backend.humanos_server import Handler, Store


class PatternDecisionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = Store(Path(self.temp.name) / "humanos.db")
        self.store.upsert_profile({"user_id": "u", "timezone": "Asia/Shanghai", "active_plan_revision": 9})
        with self.store.connect() as conn:
            repository = PersonalizationEvidenceRepository(conn)
            for index in range(5):
                day = index // 2
                evidence = EvidenceItem(
                    evidence_id=f"energy-{index}", user_id="u", source_type="state_checkin",
                    source_id=f"state-{index}", origin="explicit_user",
                    observed_at=1_723_500_000_000 + day * 86_400_000,
                    claim_key="state_checkin.self_report",
                    structured_value={"values": {"energy": 2}},
                    scope=EvidenceScope(temporal_context={
                        "timezone": "Asia/Shanghai", "local_date": f"2026-08-{18 + day:02d}",
                        "local_hour": 9, "daypart": "morning",
                    }),
                    user_explicit=True, confidence_level="high", eligible_for_pattern=True,
                )
                repository.save_evidence(evidence=evidence, timestamp=evidence.observed_at)
        self.candidate = self.store.pattern_candidates("u")[0]

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_confirmation_by_candidate_id_creates_profile_trait_once(self) -> None:
        payload = {"candidate_id": self.candidate["candidate_id"], "user_confirmed": True, "request_id": "confirm-1"}
        first = self.store.promote_pattern("u", payload)
        second = self.store.promote_pattern("u", payload)
        with self.store.connect() as conn:
            traits = conn.execute("SELECT trait_json,status FROM profile_traits WHERE user_id='u'").fetchall()
            decisions = conn.execute("SELECT * FROM pattern_decisions WHERE user_id='u' AND action='confirm'").fetchall()
        self.assertEqual(1, len(traits))
        self.assertEqual("confirmed", traits[0]["status"])
        self.assertEqual(1, len(decisions))
        self.assertEqual(first["profile_trait"]["trait_id"], second["profile_trait"]["trait_id"])
        self.assertTrue(second["replayed"])
        self.assertEqual(9, first["active_plan_revision"])

    def test_denial_becomes_counter_evidence_and_hides_candidate(self) -> None:
        before = self.store.get_profile("u")["learned_patterns"]
        result = self.store.decide_pattern_candidate("u", {
            "action": "deny", "candidate_id": self.candidate["candidate_id"], "request_id": "deny-1",
        })
        self.assertEqual("deny", result["decision"]["action"])
        self.assertEqual([], self.store.pattern_candidates("u"))
        dismissed = next(item for item in self.store._all_pattern_candidates("u") if item["candidate_id"] == self.candidate["candidate_id"])
        self.assertEqual("dismissed", dismissed["status"])
        self.assertEqual(1, dismissed["counter_evidence_count"])
        self.assertEqual(before, self.store.get_profile("u")["learned_patterns"])

    def test_defer_temporarily_hides_candidate_without_creating_evidence(self) -> None:
        defer_until = int(time.time() * 1000) + 60_000
        self.store.decide_pattern_candidate("u", {
            "action": "defer", "candidate_id": self.candidate["candidate_id"],
            "defer_until": defer_until, "request_id": "defer-1",
        })
        self.assertEqual([], self.store.pattern_candidates("u"))
        with patch("backend.humanos_server.time.time", return_value=(defer_until + 1) / 1000):
            self.assertEqual(self.candidate["candidate_id"], self.store.pattern_candidates("u")[0]["candidate_id"])
        denial_evidence = [item for item in self.store.list_personalization_evidence("u") if item["claim_key"] == "pattern_decision.denied"]
        self.assertEqual([], denial_evidence)

    def test_forget_marks_trait_forgotten_and_removes_legacy_projection(self) -> None:
        confirmed = self.store.promote_pattern("u", {
            "candidate_id": self.candidate["candidate_id"], "user_confirmed": True, "request_id": "confirm-forget",
        })
        label = confirmed["promoted_pattern"]["pattern_label"]
        result = self.store.manage_pattern("u", {"action": "forget", "pattern_label": label})
        with self.store.connect() as conn:
            row = conn.execute("SELECT status,trait_json FROM profile_traits WHERE user_id='u'").fetchone()
            status = row["status"]
        self.assertEqual("forgotten", status)
        self.assertIn('"status":"forgotten"', row["trait_json"])
        self.assertEqual([], result["learned_patterns"])
        self.assertEqual(9, result["active_plan_revision"])

    def test_candidate_below_review_threshold_cannot_be_confirmed(self) -> None:
        with self.store.connect() as conn:
            conn.execute("DELETE FROM evidence_items WHERE id IN ('energy-3','energy-4')")
        candidate = self.store.pattern_candidates("u")[0]
        self.assertFalse(candidate["can_suggest_update"])
        with self.assertRaisesRegex(ValueError, "more cross-day evidence"):
            self.store.promote_pattern("u", {"candidate_id": candidate["candidate_id"], "user_confirmed": True})

    def test_profile_trait_evidence_trace_is_scoped_and_labels_outcomes(self) -> None:
        confirmed = self.store.promote_pattern("u", {
            "candidate_id": self.candidate["candidate_id"], "user_confirmed": True, "request_id": "trace-confirm",
        })
        trait_id = confirmed["profile_trait"]["trait_id"]
        counter = EvidenceItem(
            evidence_id="counter-1", user_id="u", source_type="state_checkin", source_id="counter-state",
            origin="explicit_user", observed_at=1_724_000_000_000, claim_key="state_checkin.self_report",
            structured_value={"values": {"energy": 6}}, user_explicit=True,
            confidence_level="high", eligible_for_pattern=False,
        )
        outcome = EvidenceItem(
            evidence_id="outcome-1", user_id="u", source_type="execution_feedback", source_id="feedback-1",
            origin="explicit_user", observed_at=1_724_100_000_000, claim_key="profile_trait.execution_outcome",
            structured_value={"profile_trait_id": trait_id, "execution_context": {"attribution": "parallel"}},
            user_explicit=True, confidence_level="high", eligible_for_pattern=False,
        )
        unrelated = EvidenceItem(
            evidence_id="unrelated-1", user_id="u", source_type="context_dump", source_id="dump-1",
            origin="explicit_user", observed_at=1_724_200_000_000, claim_key="context_dump.self_report",
            structured_value={"private": "unrelated"}, user_explicit=True,
            confidence_level="high", eligible_for_pattern=True,
        )
        with self.store.connect() as conn:
            repository = PersonalizationEvidenceRepository(conn)
            for evidence in (counter, outcome, unrelated):
                repository.save_evidence(evidence=evidence, timestamp=evidence.observed_at)
            row = conn.execute(
                "SELECT id,candidate_json FROM pattern_decisions WHERE user_id='u' AND candidate_id=? AND action='confirm'",
                (self.candidate["candidate_id"],),
            ).fetchone()
            candidate = json.loads(row["candidate_json"])
            candidate["counter_evidence_ids"] = ["counter-1"]
            conn.execute("UPDATE pattern_decisions SET candidate_json=? WHERE id=?", (json.dumps(candidate), row["id"]))

        trace = self.store.profile_trait_evidence("u", trait_id)
        self.assertIsNotNone(trace)
        roles = {item["evidence_id"]: item["role"] for item in trace["evidence"]}
        self.assertEqual("supporting", roles["energy-0"])
        self.assertEqual("counter", roles["counter-1"])
        self.assertEqual("execution_outcome_parallel", roles["outcome-1"])
        self.assertNotIn("unrelated-1", roles)
        self.assertTrue(all("user_id" not in item for item in trace["evidence"]))
        self.assertEqual(5, trace["summary"]["supporting_count"])
        self.assertEqual(1, trace["summary"]["counter_count"])
        self.assertEqual(1, trace["summary"]["parallel_outcome_count"])
        self.assertIsNone(self.store.profile_trait_evidence("other-user", trait_id))

        response = {}
        handler = object.__new__(Handler)
        handler.command = "GET"
        handler.path = f"/api/profile-traits/{trait_id}/evidence?user_id=u"
        handler.send_json = lambda body, status=200: response.update({"body": body, "status": status})
        with patch.object(server_module, "store", self.store):
            handler.route()
        self.assertEqual(200, response["status"])
        self.assertEqual("profile_trait_evidence", response["body"]["meta"]["resource"])
        self.assertTrue(response["body"]["meta"]["read_only"])
        self.assertFalse(response["body"]["meta"]["causal_claim_allowed"])
        self.assertTrue(response["body"]["meta"]["unrelated_evidence_excluded"])


if __name__ == "__main__":
    unittest.main()
