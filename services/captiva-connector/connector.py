#!/usr/bin/env python3
"""Captiva Cloud Journal read-only connector for RestaurantAI.

Uses only Python stdlib (works with Oracle Linux 9's Python 3.9).
No Supabase or Captiva write operations; customer/payment details are never logged.
"""
import argparse
import base64
from collections import Counter, defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
import getpass
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

API_URL = "https://mycaptivaserver001.azurewebsites.net/CaptivaCloudAPIRequest.ashx"
CONFIG_FILE = Path.home() / ".config" / "restaurantai-captiva" / "credentials.json"
STORES = {
    "01584": "Rudy's Blanchardstown",
    "02137": "Maximilian's Bistro & Wine Bar",
    "02136": "Gourmet Pizza Factory",
}
TIMEOUT = 60


def money(value):
    try:
        return Decimal(str(value or "0"))
    except (InvalidOperation, ValueError):
        return Decimal("0")


def euros(value):
    return str(money(value).quantize(Decimal("0.01")))


def write_json_private(path, data):
    """Atomically create a private JSON file; never expose credential content in errors."""
    path = Path(path).expanduser()
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(path.parent, 0o700)
    fd, staging = tempfile.mkstemp(prefix=".captiva-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(data, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
        os.chmod(staging, 0o600)
        os.replace(staging, str(path))
    finally:
        if os.path.exists(staging):
            os.unlink(staging)


def setup():
    print("Captiva API credentials are entered here on Oracle, never in GitHub or ChatGPT.")
    api_userid = input("Captiva API key / user ID: ").strip()
    api_pass = getpass.getpass("Captiva API password (hidden): ")
    if not api_userid or not api_pass:
        raise ValueError("Both credentials are required")
    write_json_private(CONFIG_FILE, {"api_userid": api_userid, "api_pass": api_pass})
    print("Credentials stored privately at:", CONFIG_FILE)
    print("Run 'python3 connector.py preview --date 2026-09-01 --store 01584' next.")


def load_credentials():
    # Temporary environment fallback allows read-only testing without local storage.
    if os.environ.get("C_API_USER") and os.environ.get("C_API_PASS"):
        return {"api_userid": os.environ["C_API_USER"], "api_pass": os.environ["C_API_PASS"]}
    if not CONFIG_FILE.exists():
        raise RuntimeError("Credentials not configured. Run: python3 connector.py setup")
    st = CONFIG_FILE.stat()
    if st.st_mode & 0o077:
        raise RuntimeError("Credential file permissions too broad; run chmod 600 on the credentials file")
    contents = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    if not contents.get("api_userid") or not contents.get("api_pass"):
        raise RuntimeError("Credential file is incomplete")
    return contents


def captiva_request(credentials, api_request, store_id, **parameters):
    if store_id not in STORES:
        raise ValueError("Unrecognised Captiva store ID")
    body = {
        "api_userid": credentials["api_userid"],
        "api_pass": credentials["api_pass"],
        "api_request": api_request,
        "stores": [{"id": store_id}],
        **parameters,
    }
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            obj = json.load(response)
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        # Avoid printing request bodies or secrets on network failures.
        raise RuntimeError("Captiva request failed; verify Oracle connectivity and Captiva whitelist") from exc
    if obj.get("result") != "success" or obj.get("resultcode") != "000000":
        raise RuntimeError("Captiva API error %s: %s" % (obj.get("resultcode"), obj.get("resultdesc")))
    errors = obj.get("storeerrors") or []
    if errors:
        raise RuntimeError("Captiva store error; inspect permissions for store %s" % store_id)
    stores = [s for s in obj.get("stores", []) if s.get("storeid") == store_id]
    if len(stores) != 1:
        raise RuntimeError("Expected exactly one result for store %s" % store_id)
    return stores[0]


def decode_journal(store):
    if store.get("journalready") is not True or not store.get("journaldata"):
        raise RuntimeError("Journal unavailable: %s (%s)" % (store.get("journalnote"), store.get("journalcode")))
    try:
        binary = base64.b64decode(store["journaldata"], validate=True)
        # Captiva journal can contain personal/payment data; parse in-memory only.
        root = ET.fromstring(binary)
    except (ValueError, ET.ParseError) as exc:
        raise RuntimeError("Journal is not valid Base64 XML") from exc
    if root.tag != "report":
        raise RuntimeError("Unexpected journal root element")
    return root


def classify_event(code, description):
    lc = (description or "").lower()
    uc = (code or "").upper()
    if uc == "REFUND" or "refunded" in lc:
        return "refund"
    if uc == "REMITEMS":
        return "removed_items"
    if uc == "SERCHG" and "delete" in lc:
        return "service_charge_deleted"
    if "VOID" in uc or "void" in lc:
        return "possible_void_needs_review"
    if "CANCEL" in uc or "cancel" in lc:
        return "possible_cancellation_needs_review"
    return None


def summarize_journal(root):
    """Extract operational signals, not final accounting treatment.

    Product sum must NOT be treated as revenue. Combos, modifications,
    refunds and historical rows require review. Never log raw card fields.
    """
    orders = root.findall("./orders/order")
    product_total = Decimal("0")
    product_types = defaultdict(lambda: {"lines": 0, "value": Decimal("0")})
    products = defaultdict(lambda: {"name": "", "lines": 0, "qty": Decimal("0"), "raw_value": Decimal("0")})
    payments = defaultdict(lambda: {"count": 0, "value": Decimal("0")})
    event_codes = Counter()
    exception_events = []
    order_product_lines = 0
    event_count = 0

    for order_index, order in enumerate(orders, start=1):
        for item in order.findall("./products/product"):
            product_id = item.get("prodid") or "missing-id"
            name = item.get("description") or ""
            qty = money(item.get("qty"))
            value = qty * money(item.get("sellprice"))
            kind = item.get("type") or "untyped"
            order_product_lines += 1
            product_total += value
            product_types[kind]["lines"] += 1
            product_types[kind]["value"] += value
            products[product_id]["name"] = name[:150]
            products[product_id]["lines"] += 1
            products[product_id]["qty"] += qty
            products[product_id]["raw_value"] += value

        for payment in order.findall("./payments/payment"):
            status = payment.get("status") or "unknown"
            payments[status]["count"] += 1
            payments[status]["value"] += money(payment.get("value"))

        for event_index, event in enumerate(order.findall("./history/histdata"), start=1):
            event_count += 1
            code = event.get("code") or "unknown"
            desc = event.get("desc") or ""
            event_codes[code] += 1
            event_kind = classify_event(code, desc)
            if event_kind:
                # Journal-local positions are NOT verified stable POS identifiers.
                removed_match = re.search(r"Removing\s+(\d+)\s+items", desc, re.I)
                exception_events.append({
                    "order_position": order_index,
                    "history_position": event_index,
                    "event_type": event_kind,
                    "code": code,
                    "amount": euros(event.get("val")) if event.get("val") else None,
                    "removed_item_count": int(removed_match.group(1)) if removed_match else None,
                    "pos_user": (event.get("vposuser") or "")[:80] or None,
                    "event_date": event.get("date"),
                    "event_time": event.get("time"),
                    # Free-text descriptions omitted to avoid leaking personal data.
                })

    return {
        "orders_in_xml": len(orders),
        "product_lines": order_product_lines,
        "distinct_product_ids": len(products),
        "raw_product_value_NOT_revenue": euros(product_total),
        "product_types": {
            k: {"lines": v["lines"], "raw_value": euros(v["value"])}
            for k, v in sorted(product_types.items())
        },
        "products_preview_NOT_revenue": [
            {"prodid": k, "description": v["name"], "qty": str(v["qty"]), "raw_value": euros(v["raw_value"])}
            for k, v in sorted(products.items())
        ],
        "payment_summary": {
            k: {"count": v["count"], "value": euros(v["value"])}
            for k, v in sorted(payments.items())
        },
        "history_event_count": event_count,
        "history_event_code_counts": dict(sorted(event_codes.items())),
        "exception_events_preview": exception_events,
    }


def read_day(credentials, store_id, day):
    api_date = datetime.strptime(day, "%Y-%m-%d").strftime("%d/%b/%Y").lower()
    dash = captiva_request(
        credentials, "get_api_stores_dashboard", store_id,
        start_date=api_date, end_date=api_date
    )
    days = [
        d for d in dash.get("dashboards", [])
        if (d.get("dashdate") or "").lower()
        == datetime.strptime(day, "%Y-%m-%d").strftime("%d %b %Y").lower()
    ]
    if len(days) != 1:
        raise RuntimeError("Could not identify a single matching Captiva dashboard date")
    daily = days[0]
    report_kpis = (daily.get("report") or {}).get("kpis") or {}
    journal = captiva_request(credentials, "get_api_store_journal", store_id, start_date=api_date)
    details = summarize_journal(decode_journal(journal))
    original_gross = report_kpis.get("gross_all_sales")
    standard = money(details["payment_summary"].get("standard", {}).get("value"))
    return {
        "status": "preview_only_NOT_imported",
        "store_id": store_id,
        "store_name": STORES[store_id],
        "date": day,
        "captiva_dashboard": {
            "status": daily.get("status"),
            "gross_sales": euros(original_gross) if original_gross is not None else None,
            "net_sales": euros(report_kpis.get("total_all_net_sales"))
            if report_kpis.get("total_all_net_sales") is not None else None,
            "vat": euros(report_kpis.get("total_all_vat"))
            if report_kpis.get("total_all_vat") is not None else None,
            "orders": report_kpis.get("total_all_std_orders"),
            "visitors": report_kpis.get("total_all_visitors"),
        },
        "standard_payment_minus_reported_gross_DIAGNOSTIC":
        euros(standard - money(original_gross)) if original_gross is not None else None,
        "journal": details,
        "reconciled": False,
        "warning": (
            "Not approved for revenue posting: refunds/combos/voids "
            "and journal payment rules still require reconciliation."
        ),
    }


def print_report(result):
    print("\n%s | %s" % (result["store_name"], result["date"]))
    d = result["captiva_dashboard"]
    print("Captiva gross: EUR %s | net: EUR %s | orders: %s" % (
        d["gross_sales"], d["net_sales"], d["orders"]
    ))
    j = result["journal"]
    print("Journal orders: %s | product lines: %s | distinct products: %s" % (
        j["orders_in_xml"], j["product_lines"], j["distinct_product_ids"]
    ))
    print("Raw product value (NOT revenue): EUR %s" % j["raw_product_value_NOT_revenue"])
    print("Payment summary:", json.dumps(j["payment_summary"], sort_keys=True))
    print("Exception types:", dict(Counter(
        e["event_type"] for e in j["exception_events_preview"]
    )))
    print("Standard payments less dashboard gross (diagnostic only): EUR %s" % (
        result["standard_payment_minus_reported_gross_DIAGNOSTIC"]
    ))
    print("Reconciled: NO; production import remains disabled")


def main():
    parser = argparse.ArgumentParser(
        description="Read-only Captiva journal diagnostics for RestaurantAI"
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("setup", help="Store credentials privately on Oracle")
    preview = commands.add_parser(
        "preview", help="Fetch a day's dashboard and journal; NO DATABASE WRITES"
    )
    preview.add_argument("--date", required=True, help="YYYY-MM-DD, Irish local trading date")
    store = preview.add_mutually_exclusive_group(required=True)
    store.add_argument("--store", choices=list(STORES))
    store.add_argument("--all", action="store_true")
    preview.add_argument("--json-out", help="Save privacy-minimised JSON preview")
    args = parser.parse_args()

    if args.command == "setup":
        setup()
        return
    date.fromisoformat(args.date)
    credentials = load_credentials()
    store_ids = list(STORES) if args.all else [args.store]
    all_results = []
    for store_id in store_ids:
        try:
            result = read_day(credentials, store_id, args.date)
            all_results.append(result)
            print_report(result)
        except Exception as exc:
            print("%s: ERROR %s" % (STORES[store_id], exc), file=sys.stderr)
    if args.json_out and all_results:
        out = Path(args.json_out).expanduser()
        write_json_private(out, {
            "generated_at_utc": datetime.utcnow().isoformat() + "Z",
            "results": all_results,
        })
        print("Preview saved with permissions 0600:", out)
    if len(all_results) != len(store_ids):
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError) as exc:
        print("ERROR:", exc, file=sys.stderr)
        sys.exit(1)
