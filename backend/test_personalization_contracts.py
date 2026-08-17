import unittest

from pydantic import ValidationError

from backend.app.domain.personalization import (
    BehaviorEvent,
    EvidenceItem,
    EvidenceScope,
    PatternCandidate,
    ProfileTrait,
    require_profile_context_kind,
    require_task_schedule_type,
)


class PersonalizationContractTests(unittest.TestCase):
    def test_profile_context_and_task_schedule_namespaces_stay_distinct(self) -> None:
        self.assertEqual("recurring_routine", require_profile_context_kind("routine"))
        self.assertEqual("flexible_activity", require_profile_context_kind("ai_arranged"))
        self.assertEqual("flexible_task", require_task_schedule_type("flexible_task"))
        with self.assertRaises(ValueError):
            require_task_schedule_type("flexible_activity")
        with self.assertRaises(ValueError):
            require_profile_context_kind("recovery_task")

    def test_scope_requires_identity_for_typed_subjects(self) -> None:
        with self.assertRaisesRegex(ValidationError, "task_schedule_type requires task_id"):
            EvidenceScope(task_schedule_type="flexible_task")
        with self.assertRaisesRegex(ValidationError, "profile_context_kind requires context_item_id"):
            EvidenceScope(profile_context_kind="recurring_routine")

    def test_raw_event_cannot_claim_profile_write_authority(self) -> None:
        payload = {
            "event_id": "event-1",
            "user_id": "user-1",
            "event_type": "move_session",
            "source_type": "plan_edit",
            "source_id": "edit-1",
            "occurred_at": 1,
            "scope": {"task_id": "task-1", "task_schedule_type": "flexible_task"},
        }
        event = BehaviorEvent(**payload)
        self.assertFalse(event.profile_write_allowed)
        with self.assertRaises(ValidationError):
            BehaviorEvent(**{**payload, "profile_write_allowed": True})

    def test_evidence_preserves_source_scope_and_confirmation_boundary(self) -> None:
        evidence = EvidenceItem(
            evidence_id="evidence-1",
            user_id="user-1",
            source_type="chat_turn",
            source_id="turn-1",
            origin="ai_extraction",
            observed_at=10,
            claim_key="preferred_task_window",
            structured_value="morning",
            text="I prefer writing in the morning.",
            user_explicit=True,
            confidence_level="high",
            scope=EvidenceScope(
                task_id="task-1",
                task_schedule_type="flexible_task",
                task_domain_type="deep_work",
                resource_modality=["visual", "verbal"],
                attention_mode="continuous",
            ),
        )
        serialized = evidence.model_dump(mode="json")
        self.assertEqual("turn-1", serialized["source_id"])
        self.assertEqual("flexible_task", serialized["scope"]["task_schedule_type"])
        self.assertFalse(serialized["profile_write_allowed"])
        self.assertTrue(serialized["requires_user_confirmation"])

    def test_candidate_tracks_support_and_counter_evidence(self) -> None:
        candidate = PatternCandidate(
            candidate_id="candidate-1",
            user_id="user-1",
            trait_key="preferred_task_window",
            proposed_value="09:00-11:30",
            supporting_evidence_ids=["e1", "e2", "e3"],
            counter_evidence_ids=["e4"],
            sample_size=4,
            evidence_day_count=3,
            confidence_level="medium",
            status="candidate",
        )
        self.assertEqual(["e4"], candidate.counter_evidence_ids)
        self.assertFalse(candidate.profile_write_allowed)
        with self.assertRaisesRegex(ValidationError, "sample_size cannot be smaller"):
            PatternCandidate(**{**candidate.model_dump(), "sample_size": 3})

    def test_stable_trait_requires_confirmation_and_traceable_evidence(self) -> None:
        payload = {
            "trait_id": "trait-1",
            "user_id": "user-1",
            "trait_key": "preferred_task_window",
            "value": "09:00-11:30",
            "evidence_ids": ["e1", "e2", "e3"],
            "confidence_level": "medium",
            "user_confirmed": True,
            "confirmed_at": 10,
            "updated_at": 10,
            "source_candidate_id": "candidate-1",
        }
        trait = ProfileTrait(**payload)
        self.assertTrue(trait.user_confirmed)
        with self.assertRaises(ValidationError):
            ProfileTrait(**{**payload, "user_confirmed": False})
        with self.assertRaises(ValidationError):
            ProfileTrait(**{**payload, "evidence_ids": []})


if __name__ == "__main__":
    unittest.main()
