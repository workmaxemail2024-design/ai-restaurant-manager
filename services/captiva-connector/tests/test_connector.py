import sys
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from connector import classify_event, summarize_journal, euros

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

    def test_money_decimal(self):
        self.assertEqual(euros('0.1'), '0.10')

if __name__ == '__main__':
    unittest.main()
