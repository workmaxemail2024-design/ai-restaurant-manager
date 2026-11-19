#!/usr/bin/env python3
"""Read-only order-level Captiva payment variance investigation.

Shows only exceptional order number, status and aggregate amounts. No staff,
customer, card, raw XML, or complete transaction listing. Never writes data.
A journal line total is NOT an authoritative receipt or order total.
"""
import argparse
import json
from decimal import Decimal
from connector import STORES, load_credentials, money, euros
from staging import dashboard, get_final_journal


def inspect(root, financial):
    flagged = []
    standard_sum = Decimal("0")
    for order in root.findall("./orders/order"):
        header = order.find("./header")
        status = ((header.get("orderstatus") if header is not None else "") or "").strip().lower()
        number = ((header.get("ordnum") if header is not None else "") or "").strip()
        payments = order.findall("./payments/payment")
        standard = [p for p in payments if (p.get("status") or "").strip().lower() == "standard"]
        amounts = [money(p.get("value")) for p in standard]
        standard_sum += sum(amounts, Decimal("0"))
        if status not in ("std", "") or len(standard) != 1:
            # Product lines can be overlapping combo/cookbook components.
            raw_product_lines = order.findall("./products/product")
            raw_line_sum = sum((money(p.get("qty")) * money(p.get("sellprice"))
                                for p in raw_product_lines), Decimal("0"))
            flagged.append({
                "order_number": number or None,
                "order_status": status or "blank",
                "standard_payment_count": len(standard),
                "standard_payment_amounts_NOT_revenue": [euros(v) for v in amounts],
                "standard_payment_sum_NOT_revenue": euros(sum(amounts, Decimal("0"))),
                "raw_product_line_sum_NOT_revenue": euros(raw_line_sum),
                "raw_product_line_count": len(raw_product_lines),
            })
    return {
        "official_gross": financial["official_gross"],
        "official_orders": financial["official_orders"],
        "journal_standard_payment_sum_NOT_revenue": euros(standard_sum),
        "journal_minus_official_gross_DIAGNOSTIC": euros(standard_sum - money(financial["official_gross"])),
        "flagged_orders": flagged,
        "flagged_count": len(flagged),
        "reconciled": False,
        "warning": "Flagged orders are not proven causes. Raw product lines can double-count; never post them as revenue.",
    }


def main():
    parser = argparse.ArgumentParser(description="Read-only anomalous Captiva order payment diagnostic")
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
    print(json.dumps({"store_id": args.store, "date": args.date,
                      "journal_coverage": coverage, **inspect(root, financial)}, indent=2))


if __name__ == "__main__":
    main()
