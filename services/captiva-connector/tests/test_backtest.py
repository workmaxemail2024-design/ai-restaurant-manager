import unittest
from unittest.mock import patch

from backtest import check_day, run_backtest


class TestBacktest(unittest.TestCase):
    def test_five_days_two_stores_are_read_only(self):
        with patch("backtest.check_day", return_value={
            "status": "READY_FOR_STAGING_REVIEW",
            "exceptions": 1,
            "reconciled": False
        }) as day:
            rows = run_backtest(
                {"api_userid": "synthetic", "api_pass": "synthetic"},
                ["01584", "02137"], "2026-09-05", 5,
            )
        self.assertEqual(len(rows), 10)
        self.assertEqual(day.call_count, 10)
        self.assertEqual(day.call_args_list[0].args[2], "2026-09-01")
        self.assertEqual(day.call_args_list[-1].args[2], "2026-09-05")
        self.assertFalse(any(row["reconciled"] for row in rows))

    def test_closed_day_does_not_get_false_zero_exceptions(self):
        with patch("backtest.build_envelope", side_effect=ValueError(
            "Expected one Captiva dashboard entry for the requested day"
        )):
            row = check_day({}, "02137", "2026-09-06")
        self.assertEqual(row["status"], "NO_DASHBOARD_DATA")
        self.assertIsNone(row["exceptions"])
        self.assertIsNone(row["products"])

    def test_incomplete_event_identity_blocks_day(self):
        with patch("backtest.build_envelope", return_value={
            "safe_to_stage": False, "issues": ["Native identifiers missing"],
            "snapshot": {
                "store_id": "01584", "trading_date": "2026-09-01",
                "official_gross": "10.00", "official_orders": 1,
                "journal_standard_payments": "10.00",
                "journal_refund_payments": "0.00",
                "journal_coverage": "requires_review",
            },
            "events": [], "products": [],
            "diagnostic_identity": {"unidentified_exception_count": 1},
        }):
            row = check_day({}, "01584", "2026-09-01")
        self.assertEqual(row["status"], "BLOCKED_MANUAL_REVIEW")
        self.assertEqual(row["identity_diagnostic"]["unidentified_exception_count"], 1)

    def test_boundaries_and_unknown_stores(self):
        for n in (0, 15):
            with self.assertRaises(ValueError):
                run_backtest({}, ["01584"], "2026-09-05", n)
        with self.assertRaises(ValueError):
            run_backtest({}, ["99999"], "2026-09-05", 1)


if __name__ == "__main__":
    unittest.main()
