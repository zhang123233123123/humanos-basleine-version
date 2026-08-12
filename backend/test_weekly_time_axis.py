import unittest
from datetime import datetime

from backend.app.domain.timeline import WEEK_MINUTES, WeeklySegment, WeeklyTimeAxis


class WeeklyTimeAxisTests(unittest.TestCase):
    def test_points_map_between_calendar_and_axis(self):
        axis = WeeklyTimeAxis("2026-08-10", "Asia/Shanghai")
        point = axis.from_datetime(datetime.fromisoformat("2026-08-12T12:00:00+08:00"))
        self.assertEqual(point, 2 * 1440 + 720)
        self.assertEqual(axis.to_datetime(point).isoformat(), "2026-08-12T12:00:00+08:00")

    def test_occupied_segments_are_subtracted(self):
        free = WeeklyTimeAxis.subtract(
            [WeeklySegment(480, 720)],
            [WeeklySegment(540, 600), WeeklySegment(660, 690)],
        )
        self.assertEqual(free, [WeeklySegment(480, 540), WeeklySegment(600, 660), WeeklySegment(690, 720)])
        self.assertEqual(WeeklyTimeAxis.capacity(free), 150)

    def test_axis_is_finite(self):
        self.assertEqual(WEEK_MINUTES, 10080)
        with self.assertRaises(ValueError):
            WeeklySegment(10000, 10081)

    def test_find_slot_protects_rest_after_work(self):
        slot = WeeklyTimeAxis.find_slot(
            [WeeklySegment(480, 720)],
            [WeeklySegment(540, 600)],
            duration_minutes=45,
            rest_after_minutes=15,
        )
        self.assertEqual(slot, WeeklySegment(480, 525))

    def test_find_slot_respects_deadline(self):
        slot = WeeklyTimeAxis.find_slot(
            [WeeklySegment(480, 720)],
            [],
            duration_minutes=60,
            not_before=600,
            deadline=630,
        )
        self.assertIsNone(slot)


if __name__ == "__main__":
    unittest.main()
