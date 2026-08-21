import unittest

from backend.app.domain.planning import assess_next_session_fit


class SchedulingPolicyTests(unittest.TestCase):
    def test_missing_evidence_does_not_invent_capacity(self) -> None:
        decision = assess_next_session_fit("high", {"focus": 5})
        self.assertEqual("unknown", decision.fit)
        self.assertEqual("low", decision.confidence)

    def test_high_demand_is_risky_during_low_reported_capacity(self) -> None:
        decision = assess_next_session_fit("high", {"focus": 2, "energy": 3, "stress": 6})
        self.assertEqual("risky", decision.fit)
        self.assertEqual("today_next_session_only", decision.scope)

    def test_high_demand_can_be_ideal_but_remains_soft(self) -> None:
        decision = assess_next_session_fit({"level": "high"}, {"focus": 6, "energy": 5, "stress": 3})
        self.assertEqual("ideal", decision.fit)
        self.assertEqual("soft_advisory", decision.authority)


if __name__ == "__main__":
    unittest.main()
