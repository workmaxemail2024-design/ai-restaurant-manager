import sys
from pathlib import Path
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout
import io
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from connector import (
    classify_event, summarize_journal, euros, diagnose_day,
    read_day, coverage_summary
)

SAMPLE = '''<report><orders>
  <order><products>
    <product prodid="1001" description="Pizza" type="combo" qty="1" sellprice="12.50"/>
    <product prodid="1002" description="Drink" qty="2" sellprice="3.00"/>
  </products><payments><payment status="standard" value="18.50"/></payments>
  <history><histdata code="REMITEMS" desc="Removing 2 items from order." date="01 Sep 2026" vposuser="user1"/>
  </history></order>
  <order><products><product prodid="1001" description="Pizza" qty="1" sellprice="12.50"/></products>
  <payments><payment status="standard" value="12.50"/><payment status="refund" value="12.50"/></payments>
  <history><histdata code="REFUND" val="12.50" desc="Payment Refunded"/>
  <histdata code="SERCHG" desc="service charge Delete by user: example"/></history></order>
</orders></report>'''

class TestJournal(unittest.TestCase):
    def test_event_types(self):
        self.assertEqual(classify_event('REFUND', 'Payment Refunded'), 'refund')
        self.assertEqual(classify_event('REMITEMS', 'Removing 1 items from order'), 'removed_items')
        self.assertEqual(classify_event('SERCHG', 'service charge Delete'), 'service_charge_deleted')
        self.assertIsNone(classify_event('RECALL', 'recall order'))

    def test_summary_includes_audits_not_customer_fields(self):
        summary = summarize_journal(ET.fromstring(SAMPLE))
        self.assertEqual(summary['orders_in_xml'], 2)
        self.assertEqual(summary['product_lines'], 3)
        self.assertEqual(summary['distinct_product_ids'], 2)
        self.assertEqual(summary['raw_product_value_NOT_revenue'], '31.00')
        self.assertEqual(summary['payment_summary']['standard']['value'], '31.00')
        self.assertEqual(summary['payment_summary']['refund']['value'], '12.50')
        self.assertEqual(summary['exception_events_preview'][0]['removed_item_count'], 2)
        self.assertEqual(len(summary['exception_events_preview']), 3)
        self.assertNotIn('desc', summary['exception_events_preview'][0])

    def test_diagnosis_shows_missing_journal_without_importing(self):
        calls = []
        def fake_request(credentials, method, store_id, **params):
            calls.append(method)
            if method == "get_api_stores_dashboard":
                return {"dashboards": [{"dashdate": "01 Sep 2026",
                    "status": "data", "report": {"kpis": {
                        "gross_all_sales": 999.25, "total_all_std_orders": 15}}}]}
            if method == "get_api_store_journal":
                return {"journalready": False, "journalcode": "714229",
                        "journalnote": "Journal Not Found", "journaldata": ""}
            if method == "get_api_stored_journal_list":
                return {"journals": [
                    {"journal_date": "02 Sep 2026",
                     "journal_name": "journal-next-day.xml",
                     "istemp": False},
                    {"journal_date": "01 Sep 2026",
                     "journal_name": "journal-temp.xml",
                     "istemp": True}
                ]}
            raise AssertionError("unexpected request")
        buffer = io.StringIO()
        with patch("connector.captiva_request", side_effect=fake_request):
            with redirect_stdout(buffer):
                diagnose_day({"api_userid": "synthetic", "api_pass": "synthetic"},
                             "02136", "2026-09-01")
        output = buffer.getvalue()
        self.assertIn("Exact date finalised journals: 0", output)
        self.assertIn("journal-next-day.xml", output)
        self.assertIn("No financial imports were performed.", output)
        self.assertEqual(calls, [
            "get_api_stores_dashboard",
            "get_api_store_journal",
            "get_api_stored_journal_list"
        ])

    def test_dashboard_only_preview_when_journal_not_uploaded(self):
        calls = []
        def fake_request(credentials, method, store_id, **params):
            calls.append(method)
            if method == "get_api_stores_dashboard":
                return {"dashboards": [{
                    "dashdate": "01 Sep 2026",
                    "status": "data",
                    "report": {"kpis": {
                        "gross_all_sales": 2396.81,
                        "total_all_net_sales": 2130.44,
                        "total_all_vat": 266.37,
                        "total_all_std_orders": 53,
                        "total_all_visitors": 0,
                    }}
                }]}
            if method == "get_api_store_journal":
                return {"journalready": False, "journalcode": "128393",
                        "journalnote": "No Journal Data found.",
                        "journaldata": ""}
            if method == "get_api_stored_journal_list":
                return {"journals": [
                    {"journal_date": "31 Aug 2025", "istemp": False,
                     "journal_name": "old-journal.xml"}
                ]}
            raise AssertionError("Unexpected method %s" % method)

        with patch("connector.captiva_request", side_effect=fake_request):
            result = read_day(
                {"api_userid": "synthetic", "api_pass": "synthetic"},
                "02136", "2026-09-01"
            )
        self.assertEqual(result["captiva_dashboard"]["gross_sales"], "2396.81")
        self.assertEqual(result["captiva_dashboard"]["orders"], 53)
        self.assertIsNone(result["journal"])
        self.assertEqual(result["journal_status"], "no_journal_uploaded_for_date")
        self.assertIsNone(result["standard_payment_minus_reported_gross_DIAGNOSTIC"])
        self.assertFalse(result["reconciled"])
        self.assertEqual(calls, [
            "get_api_stores_dashboard", "get_api_store_journal",
            "get_api_stored_journal_list",
        ])

    def test_coverage_summary(self):
        journals = [
            {"journal_date": "30 Aug 2026", "istemp": False},
            {"journal_date": "01 Sep 2026", "istemp": False},
            {"journal_date": "02 Sep 2026", "istemp": True},
            {"journal_date": "05 Nov 2026", "istemp": False},
        ]
        c = coverage_summary(journals, "2026-09")
        self.assertEqual(c["total_listed"], 4)
        self.assertEqual(c["earliest"], "2026-08-30")
        self.assertEqual(c["latest"], "2026-11-05")
        self.assertEqual(c["selected_month_count"], 2)
        self.assertEqual(c["selected_month_finalised"], 1)
        self.assertEqual(c["selected_month_temporary"], 1)

    def test_money_decimal(self):
        self.assertEqual(euros('0.1'), '0.10')

if __name__ == '__main__':
    unittest.main()
