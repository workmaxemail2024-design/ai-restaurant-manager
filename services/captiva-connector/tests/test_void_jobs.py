from datetime import date
import sqlite3
import unittest
from unittest.mock import patch
from void_jobs import import_day, journal_days


class VoidJobsTests(unittest.TestCase):
    def test_only_final_days_in_range(self):
        records = [{"journal_date":"19 Nov 2026","istemp":v} for v in [False,False,True]]
        records.append({"journal_date":"18 Nov 2026","istemp":True})
        self.assertEqual(journal_days({"journals":records}, date(2026,11,1),date(2026,11,19)), ["2026-11-19"])

    def test_retry_only_after_acknowledgement(self):
        db = sqlite3.connect(":memory:")
        db.execute("create table processed (store text, day text, fingerprint text, primary key(store,day))")
        with patch("void_jobs.build",return_value={"void_orders":[],"source_fingerprint":"f"}), patch("void_jobs.send") as send:
            send.return_value={"success":False}
            with self.assertRaises(RuntimeError):
                import_day({}, "s","day",db)
            send.return_value={"success":True,"revenue_changed":False,"result":{"inserted":0}}
            import_day({}, "s","day",db)
            import_day({}, "s","day",db)
            self.assertEqual(send.call_count,2)
            with self.assertRaises(ValueError):
                import_day({}, "s","day",db,proof=True)
