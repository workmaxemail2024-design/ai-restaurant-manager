import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

from staging import summarize_events, summarize_products, build_envelope, sha256, export_summary

JOURNAL = """<report><orders>
<order>
<header orderid="111" />
<products>
  <product prodid="1001" description="Chicken" type="combo" qty="1" sellprice="25.50"/>
  <product prodid="1002" description="Drink" qty="2" sellprice="5.00"/>
</products>
<history>
  <histdata code="REFUND" id="101" systemid="a" date="01 Sep 2026"
    time="12:30" desc="Payment Refunded" val="25.50" vposuser="8"/>
  <histdata code="ORDER" id="102" systemid="b" date="01 Sep 2026" time="12:31"/>
  <histdata code="REMITEMS" id="103" systemid="c" date="01 Sep 2026"
    time="12:33" desc="Removing 11 items from order." />
</history>
</order>
</orders></report>"""


class TestStaging(unittest.TestCase):
    def test_stable_event_identity_does_not_depend_on_positions(self):
        root = ET.fromstring(JOURNAL)
        p1 = summarize_events(root, "jnl_01sep2026_01584_example.xml")
        p2 = summarize_events(root, "jnl_01sep2026_01584_example.xml")
        self.assertEqual(p1["events"], p2["events"])
        self.assertEqual(len(p1["events"]), 2)
        self.assertEqual(p1["events"][0]["original_amount"], "25.50")
        self.assertEqual(p1["events"][1]["removed_item_count"], 11)
        self.assertNotIn("desc", p1["events"][0])
        self.assertEqual(len(p1["events"][0]["source_event_key"]), 64)

    def test_missing_native_id_fails_closed(self):
        xml = JOURNAL.replace('id="103"', "")
        v = summarize_events(ET.fromstring(xml), "jnl_01sep2026_01584_example.xml")
        self.assertEqual(v["unidentified_exception_count"], 1)
        self.assertEqual(len(v["events"]), 1)

    def test_duplicate_native_events_fail_closed(self):
        xml = JOURNAL.replace(
            '</history>',
            '<histdata code="REFUND" id="101" systemid="a" date="01 Sep 2026" time="12:30" val="25.50"/></history>'
        )
        with self.assertRaisesRegex(ValueError, "Duplicate native"):
            summarize_events(ET.fromstring(xml), "jnl_01sep2026_01584_example.xml")

    def test_product_values_are_not_reported_as_revenue(self):
        x = summarize_products(ET.fromstring(JOURNAL))
        self.assertEqual(x[0]["raw_value_not_revenue"], "25.50")
        self.assertEqual(x[1]["quantity"], "2")
        self.assertEqual(x[1]["raw_value_not_revenue"], "10.00")
        self.assertTrue(all("gross" not in p for p in x))

    def test_staging_requires_journal_order_count(self):
        with patch("staging.dashboard", return_value={
            "official_gross": "35.50", "official_net": "30.00",
            "official_vat": "5.50", "official_orders": 5,
        }):
            with patch("staging.get_final_journal", return_value=(
                "jnl_01sep2026_01584_example.xml", ET.fromstring(JOURNAL), "complete"
            )):
                data = build_envelope({}, "01584", "2026-09-01")
        self.assertFalse(data["safe_to_stage"])
        self.assertEqual(data["snapshot"]["journal_coverage"], "requires_review")
        self.assertEqual(data["events"], [])
        self.assertEqual(data["products"], [])

    def test_missing_journal_keeps_financial_snapshot_no_exception_zero(self):
        with patch("staging.dashboard", return_value={
            "official_gross": "2396.81", "official_net": "2178.09",
            "official_vat": "218.72", "official_orders": 53,
        }):
            with patch("staging.get_final_journal", return_value=(
                None, None, "dashboard_only"
            )):
                data = build_envelope({}, "02136", "2026-09-01")
        self.assertTrue(data["safe_to_stage"])
        self.assertEqual(data["snapshot"]["official_orders"], 53)
        summary = export_summary(data)
        self.assertIsNone(summary["exceptions"])
        self.assertIsNone(summary["products"])

    def test_complete_sample(self):
        with patch("staging.dashboard", return_value={
            "official_gross": "35.50", "official_net": "30.00",
            "official_vat": "5.50", "official_orders": 1,
        }):
            with patch("staging.get_final_journal", return_value=(
                "jnl_01sep2026_01584_example.xml", ET.fromstring(JOURNAL), "complete"
            )):
                data = build_envelope({}, "01584", "2026-09-01")
        self.assertTrue(data["safe_to_stage"])
        self.assertEqual(len(data["events"]), 2)
        self.assertEqual(len(data["products"]), 2)
        self.assertEqual(data["source_fingerprint"], sha256({"snapshot": data["snapshot"], "events": data["events"], "products": data["products"]}))
        self.assertFalse(data["reconciled"])


if __name__ == "__main__":
    unittest.main()
