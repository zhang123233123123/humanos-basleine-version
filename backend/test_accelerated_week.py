import tempfile
import unittest
from pathlib import Path

from scripts.simulate_accelerated_week import simulate_week


class AcceleratedWeekTests(unittest.TestCase):
    def test_seven_days_execute_and_roll_over_without_waiting(self):
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            report = simulate_week(Path(temp_dir) / "week.db")

        self.assertEqual(7, report["totals"]["days"])
        self.assertEqual(7, report["totals"]["daily_checkins"])
        self.assertEqual(7, report["totals"]["feedback_records"])
        self.assertEqual(1, report["totals"]["context_dumps"])
        self.assertEqual(5, report["totals"]["completed_tasks"])
        self.assertEqual(2, report["totals"]["unfinished_tasks"])
        self.assertTrue(report["rollover"]["old_plan_superseded"])
        self.assertTrue(report["rollover"]["routine_reused"])
        self.assertTrue(report["rollover"]["daily_checkin_reset"])


if __name__ == "__main__":
    unittest.main()
