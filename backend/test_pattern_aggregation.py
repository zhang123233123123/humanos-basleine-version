import tempfile
import unittest
from pathlib import Path

from backend.app.application.pattern_aggregation import build_evidence_pattern_candidates
from backend.app.domain.personalization import EvidenceItem, EvidenceScope
from backend.app.repositories.personalization import PersonalizationEvidenceRepository
from backend.humanos_server import Store


DAY = 86_400_000


def state_evidence(index: int, *, day: int, daypart: str = "morning", energy: int = 2, eligible: bool = True) -> dict:
    item = EvidenceItem(
        evidence_id=f"e-{index}", user_id="u", source_type="state_checkin",
        source_id=f"state-{index}", origin="explicit_user",
        observed_at=1_700_000_000_000 + day * DAY,
        claim_key="state_checkin.self_report",
        structured_value={"values": {"energy": energy}},
        scope=EvidenceScope(temporal_context={
            "timezone": "Asia/Shanghai", "local_date": f"2026-08-{18 + day:02d}",
            "local_hour": 9 if daypart == "morning" else 15, "daypart": daypart,
        }),
        user_explicit=True, confidence_level="high", eligible_for_pattern=eligible,
    ).model_dump(mode="json")
    item["eligible_for_pattern"] = eligible
    return item


class PatternAggregationTests(unittest.TestCase):
    def candidates(self, evidence):
        return build_evidence_pattern_candidates(evidence, user_id="u", timezone_name="Asia/Shanghai")

    def test_three_supports_across_two_days_create_candidate_but_not_confirmation_prompt(self) -> None:
        candidate = self.candidates([
            state_evidence(1, day=0), state_evidence(2, day=1), state_evidence(3, day=1),
        ])[0]
        self.assertEqual("candidate", candidate["status"])
        self.assertFalse(candidate["can_suggest_update"])
        self.assertEqual((3, 2), (candidate["episode_count"], candidate["support_day_count"]))

    def test_five_supports_across_three_days_allow_user_review(self) -> None:
        candidate = self.candidates([state_evidence(index, day=(index - 1) // 2) for index in range(1, 6)])[0]
        self.assertEqual("candidate", candidate["status"])
        self.assertTrue(candidate["can_suggest_update"])
        self.assertEqual("high", candidate["confidence_level"])

    def test_counter_evidence_can_keep_pattern_below_threshold(self) -> None:
        evidence = [state_evidence(index, day=(index - 1) // 2, energy=2) for index in range(1, 6)]
        evidence += [state_evidence(index, day=index - 6, energy=6) for index in range(6, 9)]
        low = next(item for item in self.candidates(evidence) if item["pattern_label"] == "state:morning:energy:low")
        self.assertEqual(3, low["counter_evidence_count"])
        self.assertEqual(0.625, low["support_ratio"])
        self.assertEqual("insufficient_evidence", low["status"])

    def test_daypart_scopes_do_not_get_merged(self) -> None:
        evidence = [state_evidence(index, day=index - 1, daypart="morning") for index in range(1, 4)]
        evidence += [state_evidence(index, day=index - 4, daypart="afternoon") for index in range(4, 7)]
        candidates = self.candidates(evidence)
        self.assertEqual({"state:morning:energy:low", "state:afternoon:energy:low"}, {item["pattern_label"] for item in candidates})
        self.assertTrue(all(item["episode_count"] == 3 for item in candidates))

    def test_ineligible_evidence_is_excluded(self) -> None:
        evidence = [state_evidence(index, day=index - 1, eligible=index != 3) for index in range(1, 4)]
        candidate = self.candidates(evidence)[0]
        self.assertEqual(2, candidate["episode_count"])
        self.assertEqual("insufficient_evidence", candidate["status"])

    def test_candidate_identity_is_stable_when_input_order_changes(self) -> None:
        evidence = [state_evidence(index, day=index - 1) for index in range(1, 4)]
        first = self.candidates(evidence)[0]
        second = self.candidates(list(reversed(evidence)))[0]
        self.assertEqual(first["candidate_id"], second["candidate_id"])
        self.assertEqual(set(first["supporting_evidence_ids"]), set(second["supporting_evidence_ids"]))


class PatternAggregationStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = Store(Path(self.temp.name) / "humanos.db")
        self.store.upsert_profile({"user_id": "u", "timezone": "Asia/Shanghai"})

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_store_candidates_read_evidence_items_and_ignore_legacy_memories(self) -> None:
        with self.store.connect() as conn:
            repository = PersonalizationEvidenceRepository(conn)
            for index in range(1, 6):
                raw = state_evidence(index, day=(index - 1) // 2)
                repository.save_evidence(evidence=EvidenceItem(**raw), timestamp=int(raw["observed_at"]))
            conn.execute(
                "INSERT INTO memories (id,user_id,source_type,source_id,task_id,text,metadata_json,embedding_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                ("legacy", "u", "episodic_memory", "legacy", None, "legacy", '{"pattern_label":"legacy-only"}', "[]", 1_700_000_000_000),
            )
        before = self.store.get_profile("u")["learned_patterns"]
        candidates = self.store.pattern_candidates("u")
        self.assertEqual(["state:morning:energy:low"], [item["pattern_label"] for item in candidates])
        self.assertTrue(candidates[0]["can_suggest_update"])
        self.assertNotIn("legacy-only", [item["pattern_label"] for item in candidates])
        self.assertEqual(before, self.store.get_profile("u")["learned_patterns"])


if __name__ == "__main__":
    unittest.main()
