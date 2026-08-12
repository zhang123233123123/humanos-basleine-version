import unittest

from backend.app.application.behavior_features import local_behavior_features


class BehaviorFeatureTests(unittest.TestCase):
    def test_future_completion_is_not_progress(self) -> None:
        result = local_behavior_features("我需要周五前完成期末复习，大概三个小时")
        self.assertEqual("add_task", result["intent"])

    def test_explicit_state_keeps_evidence(self) -> None:
        result = local_behavior_features("我很累而且无法专注")
        self.assertTrue(result["explicit_state"]["fatigue"])
        self.assertTrue(result["explicit_state"]["focus_difficulty"])
        self.assertEqual("我很累而且无法专注", result["evidence_span"])


if __name__ == "__main__":
    unittest.main()
