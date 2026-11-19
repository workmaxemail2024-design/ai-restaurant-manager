#!/usr/bin/env python3
"""Read-only, privacy-minimised payment discrepancy diagnostic.

Never prints order IDs, operator names, customer/card data or raw XML.
Does not write to Supabase or modify Captiva.
"""
import argparse
import json
from collections import Counter, defaultdict
from decimal import Decimal
from connector import STORES, load_credentials, money, euros
from staging import dashboard, get_final_journal


def diagnose(root, financial):
    statuses = Counter()
    payment_counts = Counter()
    payment_values = defaultdict(lambda: Decimal("0"))
    by_order_status = defaultdict(lambda: {"orders": 0, "payments": 0, "standard": Decimal("0")})
    standard_count_histogram = Counter()
    standard_on_void = Decimal("0")
    no_standard_orders = 0
    for order in root.findall("./orders/order"):
        header = order.find("./header")
        status = ((header.get("orderstatus") if header is not None else "") or "").strip().lower() or "blank"
        statuses[status] += 1
        bucket = by_order_status[status]
        bucket["orders"] += 1
        standard_count = 0
        for payment in order.findall("./payments/payment"):
            kind = (payment.get("status") or "").strip().lower() or "blank"
            value = money(payment.get("value"))
            payment_counts[kind] += 1
            payment_values[kind] += value
            bucket["payments"] += 1
            if kind == "standard":
                standard_count += 1
                bucket["standard"] += value
                if status == "void":
                    standard_on_void += value
        standard_count_histogram[standard_count] += 1
        if standard_count == 0 and status in ("std", "blank"):
            no_standard_orders += 1
    standard = payment_values["standard"]
    return {
        "official_gross": financial["official_gross"],
        "official_orders": financial["official_orders"],
        "journal_order_status_counts": dict(sorted(statuses.items())),
        "payment_status_counts": dict(sorted(payment_counts.items())),
        "payment_status_totals_NOT_revenue": {k: euros(v) for k, v in sorted(payment_values.items())},
        "standard_payment_count_per_order_histogram": {str(k): v for k, v in sorted(standard_count_histogram.items())},
        "orders_without_standard_payment": no_standard_orders,
        "standard_payments_on_void_orders_NOT_revenue": euros(standard_on_void),
        "by_order_status": {
            k: {"orders": v["orders"], "payment_entries": v["payments"],
                "standard_payments_NOT_revenue": euros(v["standard"])}
            for k, v in sorted(by_order_status.items())
        },
        "standard_payment_minus_official_gross_DIAGNOSTIC": euros(standard - money(financial["official_gross"])),
        "reconciled": False,
        "note": "Aggregates alone cannot establish payment duplication or explain variance. Do not post as revenue.",
    }


def main():
    parser = argparse.ArgumentParser(description="Read-only Captiva payment structure diagnostic")
    parser.add_argument("--date", required=True)
    parser.add_argument("--store", required=True, choices=sorted(STORES))
    args = parser.parse_args()
    credentials = load_credentials()
    financial = dashboard(credentials, args.store, args.date)
    _, root, coverage = get_final_journal(credentials, args.store, args.date)
    if coverage != "complete":
        print(json.dumps({"store_id": args.store, "date": args.date,
                          "journal_coverage": coverage, "reconciled": False}, indent=2))
        return
    result = diagnose(root, financial)
    print(json.dumps({"store_id": args.store, "date": args.date,
                      "journal_coverage": coverage, **result}, indent=2))


if __name__ == "__main__":
    main()
