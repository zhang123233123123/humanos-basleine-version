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


if __name__ == "__main__":
    unittest.main()
