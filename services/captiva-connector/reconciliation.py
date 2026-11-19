#!/usr/bin/env python3
"""Read-only Captiva gross/payment/product hierarchy diagnostics.

Never outputs raw XML, card/customer details, staff identifiers or exact orders.
Product qty × sellprice remains an UNVERIFIED RAW OBSERVATION, not revenue.
"""
import argparse
from collections import defaultdict
from decimal import Decimal
import json
import sys

from connector import STORES, load_credentials, money, euros
from staging import dashboard, get_final_journal


def analyze(root, financial):
    products = defaultdict(lambda: {"lines": 0, "quantity": Decimal("0"), "raw_value": Decimal("0")})
    payment_totals = defaultdict(lambda: {"count": 0, "value": Decimal("0")})
    code_totals = defaultdict(lambda: {"count": 0, "raw_val": Decimal("0")})
    attribute_names = set()
    order_count = 0
    for order in root.findall("./orders/order"):
        order_count += 1
        for product in order.findall("./products/product"):
            item_type = (product.get("type") or "untyped")[:50]
            attribute_names.update(product.attrib.keys())
            info = products[item_type]
            info["lines"] += 1
            quantity = money(product.get("qty"))
            info["quantity"] += quantity
            info["raw_value"] += quantity * money(product.get("sellprice"))
        for p in order.findall("./payments/payment"):
            status = (p.get("status") or "unknown")[:50].lower()
            payment_totals[status]["count"] += 1
            payment_totals[status]["value"] += money(p.get("value"))
        for event in order.findall("./history/histdata"):
            code = (event.get("code") or "unknown")[:60].upper()
            if code not in ("SERCHG", "REMITEMS", "REFUND"):
                continue
            code_totals[code]["count"] += 1
            code_totals[code]["raw_val"] += money(event.get("val"))
    standard = payment_totals.get("standard", {}).get("value", Decimal("0"))
    return {
        "official_gross": financial["official_gross"],
        "official_net": financial["official_net"],
        "official_vat": financial["official_vat"],
        "official_orders": financial["official_orders"],
        "journal_orders": order_count,
        "standard_payment_minus_gross_DIAGNOSTIC": euros(
            standard - money(financial["official_gross"])
        ),
        "payment_statuses_NOT_revenue": {
            status: {"count": v["count"], "value": euros(v["value"])}
            for status, v in sorted(payment_totals.items())
        },
        "product_types_RAW_NOT_revenue": {
            kind: {
                "lines": v["lines"],
                "quantity": str(v["quantity"]),
                "raw_value": euros(v["raw_value"]),
            }
            for kind, v in sorted(products.items())
        },
        "audit_event_codes_RAW_NOT_loss": {
            code: {"count": v["count"], "event_val_sum": euros(v["raw_val"])}
            for code, v in sorted(code_totals.items())
        },
        "product_attribute_names": sorted(attribute_names),
        "reconciled": False,
        "warning": "Raw line and history values do not prove received revenue or loss.",
    }


def inspect_day(credentials, store_id, day):
    fin = dashboard(credentials, store_id, day)
    filename, root, coverage = get_final_journal(credentials, store_id, day)
    if coverage != "complete":
        return {
            "store_id": store_id,
            "date": day,
            "official_gross": fin["official_gross"],
            "journal_coverage": coverage,
            "payment_statuses_NOT_revenue": None,
            "product_types_RAW_NOT_revenue": None,
            "audit_event_codes_RAW_NOT_loss": None,
            "reconciled": False,
        }
    return {"store_id": store_id, "date": day, "journal_coverage": coverage, **analyze(root, fin)}


def main():
    parser = argparse.ArgumentParser(description="Captiva read-only finance hierarchy diagnostic")
    parser.add_argument("--date", required=True, help="YYYY-MM-DD")
    parser.add_argument("--stores", default="01584,02137", help="Comma-separated store IDs")
    args = parser.parse_args()
    selected = [x.strip() for x in args.stores.split(",")]
    credentials = load_credentials()
    failed = False
    for store in selected:
        if store not in STORES:
            parser.error("Unknown store ID: " + store)
        try:
            print(json.dumps(inspect_day(credentials, store, args.date), indent=2, ensure_ascii=False))
        except (ValueError, RuntimeError) as error:
            print("%s: diagnostics unavailable (%s)" % (store, type(error).__name__), file=sys.stderr)
            failed = True
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
