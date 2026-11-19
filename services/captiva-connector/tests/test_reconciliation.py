import unittest
import xml.etree.ElementTree as ET
from unittest.mock import patch

from reconciliation import analyze, inspect_day

DATA = """<report><orders>
<order>
<products>
<product prodid="100" type="combo" qty="1" sellprice="30"/>
<product prodid="101" type="addon" qty="1" sellprice="5"/>
</products>
<payments><payment status="standard" value="25"/></payments>
<history><histdata code="REMITEMS" val="0" desc="Removing one item"/></history>
</order>
<order>
<products><product prodid="100" type="combo" qty="1" sellprice="30"/></products>
<payments><payment status="standard" value="25"/>
<payment status="refund" value="25"/></payments>
<history><histdata code="REFUND" val="25"/></history>
</order></orders></report>"""

class TestReconciliation(unittest.TestCase):
    def test_refund_not_deducted_from_official_gross(self):
        finances={"official_gross":"50.00", "official_net":"45.00",
                  "official_vat":"5.00", "official_orders":2}
        result=analyze(ET.fromstring(DATA),finances)
        self.assertEqual(result["official_gross"],"50.00")
        self.assertEqual(result["standard_payment_minus_gross_DIAGNOSTIC"],"0.00")
        self.assertEqual(result["payment_statuses_NOT_revenue"]["refund"]["value"],"25.00")
        self.assertEqual(result["product_types_RAW_NOT_revenue"]["combo"]["raw_value"],"60.00")
        self.assertEqual(result["audit_event_codes_RAW_NOT_loss"]["REFUND"]["event_val_sum"],"25.00")
        self.assertFalse(result["reconciled"])

    def test_missing_journal_shows_unknown_audit_data(self):
        with patch("reconciliation.dashboard",return_value={
            "official_gross":"2396.81","official_orders":53
        }):
            with patch("reconciliation.get_final_journal",
                       return_value=(None,None,"dashboard_only")):
                report=inspect_day({},"02136","2026-09-01")
        self.assertIsNone(report["payment_statuses_NOT_revenue"])
        self.assertIsNone(report["product_types_RAW_NOT_revenue"])
        self.assertEqual(report["official_gross"],"2396.81")

if __name__=="__main__":
    unittest.main()
