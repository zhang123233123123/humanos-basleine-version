import unittest
import tempfile
from pathlib import Path

from backend.app.domain.task.resource_profile import (
    normalize_attention_mode,
    normalize_resource_tags,
    parallel_compatibility,
    require_valid_attention_mode,
    require_valid_resource_tags,
)
from backend.humanos_server import Store


class TaskResourceProfileTests(unittest.TestCase):
    def test_legacy_action_tags_normalize_without_duplicate_dimensions(self) -> None:
        self.assertEqual(["motor", "visual"], normalize_resource_tags(["manual", "mobility", "视觉"]))

    def test_invalid_attention_mode_is_conservative(self) -> None:
        self.assertEqual("continuous", normalize_attention_mode("unknown"))

    def test_command_validation_rejects_unknown_resource_values(self) -> None:
        with self.assertRaises(ValueError):
            require_valid_resource_tags(["visual", "cognitive"])
        with self.assertRaises(ValueError):
            require_valid_attention_mode("sometimes")

    def test_shared_language_tag_blocks_cross_modal_language_tasks(self) -> None:
        allowed, reason = parallel_compatibility(
            {"resource_modality": ["visual", "verbal"], "attention_mode": "continuous", "parallelizable": True},
            {"resource_modality": ["auditory", "verbal"], "attention_mode": "continuous", "parallelizable": True},
        )
        self.assertFalse(allowed)
        self.assertIn("verbal", reason)

    def test_separate_tags_allow_one_intermittent_task(self) -> None:
        allowed, _ = parallel_compatibility(
            {"resource_modality": ["motor"], "attention_mode": "intermittent", "parallelizable": True},
            {"resource_modality": ["auditory", "verbal"], "attention_mode": "continuous", "parallelizable": True},
        )
        self.assertTrue(allowed)

    def test_two_continuous_tasks_are_rejected_even_with_separate_tags(self) -> None:
        allowed, reason = parallel_compatibility(
            {"resource_modality": ["motor"], "attention_mode": "continuous", "parallelizable": True},
            {"resource_modality": ["auditory"], "attention_mode": "continuous", "parallelizable": True},
        )
        self.assertFalse(allowed)
        self.assertIn("continuously", reason)

    def test_resource_compatibility_does_not_override_parallel_permission(self) -> None:
        allowed, _ = parallel_compatibility(
            {"resource_modality": ["visual", "verbal"], "attention_mode": "continuous", "parallelizable": False},
            {"resource_modality": ["motor"], "attention_mode": "passive", "parallelizable": False},
        )
        self.assertFalse(allowed)

    def test_task_resource_profile_round_trips_through_sqlite(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = Store(Path(temp_dir) / "resource-profile.db")
            created = store.create_task("user-a", {
                "title": "洗衣",
                "duration": 30,
                "priority": "低",
                "resource_modality": ["manual", "mobility"],
                "attention_mode": "intermittent",
                "parallelizable": True,
            })
            self.assertEqual(["motor"], created["resource_modality"])
            self.assertEqual("intermittent", created["attention_mode"])
            updated = store.patch_task(created["id"], {"attention_mode": "passive"}, "user-a")
            self.assertEqual("passive", updated["attention_mode"])

    def test_resource_profile_edit_is_a_scheduling_change(self) -> None:
        from backend.app.domain.task.update import decide_task_patch

        current = {"resource_modality": ["visual"], "attention_mode": "continuous", "parallelizable": False}
        decision = decide_task_patch(current, {"resource_modality": ["motor"], "attention_mode": "intermittent"})
        self.assertTrue(decision.schedule_changed)


if __name__ == "__main__":
    unittest.main()
