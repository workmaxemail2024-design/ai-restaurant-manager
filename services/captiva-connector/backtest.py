#!/usr/bin/env python3
"""Read-only multi-day Captiva identifier and reconciliation backtest.

Never sends data to Supabase, never writes POS or finance ledgers, and omits
raw XML, customer/card data, operator names and product descriptions.
"""
import argparse
from collections import Counter
from datetime import date, timedelta
import json
import sys
import time

from connector import STORES, load_credentials, write_json_private
from staging import build_envelope, export_summary


def check_day(credentials, store_id, trade_date):
    """Use the SAME production parser as staging; never guess transaction totals."""
    try:
        data = build_envelope(credentials, store_id, trade_date)
        result = export_summary(data)
        result["status"] = (
            "READY_FOR_STAGING_REVIEW" if data["safe_to_stage"]
            else "BLOCKED_MANUAL_REVIEW"
        )
        return result
    except ValueError as error:
        # Some venues close on particular weekdays. No dashboard is not zero.
        msg = str(error)
        if "Expected one Captiva dashboard entry" in msg:
            return {
                "store_id": store_id, "trading_date": trade_date,
                "status": "NO_DASHBOARD_DATA", "exceptions": None,
                "products": None, "journal_coverage": "unknown",
                "reconciled": False,
            }
        return {
            "store_id": store_id, "trading_date": trade_date,
            "status": "BLOCKED_MANUAL_REVIEW", "error_type": type(error).__name__,
            "exceptions": None, "products": None, "reconciled": False,
        }
    except RuntimeError as error:
        return {
            "store_id": store_id, "trading_date": trade_date,
            "status": "API_OR_JOURNAL_ERROR", "error_type": type(error).__name__,
            "exceptions": None, "products": None, "reconciled": False,
        }


def run_backtest(credentials, stores, end_date, days, pause_seconds=0):
    if days < 1 or days > 14:
        raise ValueError("Backtest supports between 1 and 14 trading dates")
    end = date.fromisoformat(end_date)
    if end > date.today():
        raise ValueError("Use a completed, non-future date for backtesting")
    results = []
    for store_id in stores:
        if store_id not in STORES:
            raise ValueError("Unrecognised Captiva store ID")
        for delta in range(days - 1, -1, -1):
            day = (end - timedelta(days=delta)).isoformat()
            row = check_day(credentials, store_id, day)
            results.append(row)
            if pause_seconds:
                time.sleep(pause_seconds)
    return results


def show_summary(rows):
    counters = Counter(row["status"] for row in rows)
    for row in rows:
        # No order/customer IDs, POS users, raw XML or card details.
        print(
            "%s | %s | %-26s | orders: %s | exceptions: %s | "
            "payment variance (diagnostic): %s | unidentified: %s"
            % (
                row["store_id"], row["trading_date"], row["status"],
                row.get("official_orders", "?"),
                row.get("exceptions"),
                row.get("standard_payments_minus_official_gross_DIAGNOSTIC"),
                (row.get("identity_diagnostic") or {}).get("unidentified_exception_count"),
            )
        )
    print("\nSummary:", dict(counters))
    print("READ-ONLY — no Supabase writes; no financial reconciliation approved.")


def main():
    p = argparse.ArgumentParser(description="Read-only Captiva multi-day validation")
    p.add_argument("--end-date", required=True, help="Completed YYYY-MM-DD")
    p.add_argument("--days", type=int, default=5)
    group = p.add_mutually_exclusive_group(required=True)
    group.add_argument("--stores", help="Comma-separated known Captiva store IDs")
    group.add_argument("--all", action="store_true")
    p.add_argument("--json-out", help="Optional private JSON summary (0600)")
    args = p.parse_args()

    stores = list(STORES) if args.all else [x.strip() for x in args.stores.split(",")]
    if not stores or len(stores) != len(set(stores)):
        p.error("Store IDs must be unique")
    rows = run_backtest(load_credentials(), stores, args.end_date, args.days, 0.35)
    show_summary(rows)
    if args.json_out:
        write_json_private(args.json_out, {"backtest": rows})
        print("Private report saved:", args.json_out)
    if any(r["status"] in ("BLOCKED_MANUAL_REVIEW", "API_OR_JOURNAL_ERROR") for r in rows):
        sys.exit(2)


if __name__ == "__main__":
    main()
