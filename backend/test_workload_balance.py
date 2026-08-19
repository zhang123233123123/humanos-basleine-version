import unittest

from backend.app.application.workload_balance import eligible_workload_days, workload_balance_metrics


class WorkloadBalanceMetricsTests(unittest.TestCase):
    def test_eligible_days_respect_today_and_task_deadlines(self) -> None:
        self.assertEqual({2, 3, 4}, eligible_workload_days(range(7), [3, 4], 2))
        self.assertEqual({2, 3, 4, 5, 6}, eligible_workload_days(range(7), [None], 2))

    def test_empty_eligible_days_are_included_in_variance(self) -> None:
        concentrated = workload_balance_metrics(
            [{"day_index": 0, "session_minutes": 120}],
            [0, 1, 2],
        )
        distributed = workload_balance_metrics(
            [
                {"day_index": 0, "session_minutes": 40},
                {"day_index": 1, "session_minutes": 40},
                {"day_index": 2, "session_minutes": 40},
            ],
            [0, 1, 2],
        )
        self.assertEqual({0: 120, 1: 0, 2: 0}, concentrated["daily_load_minutes"])
        self.assertGreater(concentrated["daily_load_variance"], distributed["daily_load_variance"])
        self.assertGreater(concentrated["daily_peak_minutes"], distributed["daily_peak_minutes"])

    def test_ineligible_days_do_not_distort_balance(self) -> None:
        metrics = workload_balance_metrics(
            [{"day_index": 0, "session_minutes": 60}],
            [0],
        )
        self.assertEqual(0, metrics["daily_load_variance"])
        self.assertEqual(1, metrics["eligible_day_count"])


if __name__ == "__main__":
    unittest.main()
