"""Privacy-minimised Captiva Cloud day envelope for secure staging.

NO network uploads, external writes, live revenue posting or raw XML persistence.
A later explicit sender must sign and deliver the generated envelope.

Event identity is deliberately strict: events with absent native history identifiers
or collisions are NOT silently given positional identifiers.
"""
from datetime import datetime, date
from decimal import Decimal
import hashlib
import json
import re

from connector import (
    STORES, captiva_request, decode_journal, load_credentials, money, euros,
)

EVENT_CODES = {
    "REFUND": "refund",
    "REMITEMS": "removed_items",
}
HEX64 = re.compile(r"^[0-9a-f]{64}$")
JOURNAL_NAME = re.compile(r"^[A-Za-z0-9_.-]{8,255}[.]xml$")
SAFE_PRODUCT_ID = re.compile(r"^[a-zA-Z0-9_.:-]{1,100}$")


def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode("utf-8")


def sha256(value):
    return hashlib.sha256(canonical_json(value)).hexdigest()


def api_day(day):
    return date.fromisoformat(day).strftime("%d/%b/%Y").lower()


def dashboard(credentials, store_id, day):
    target = datetime.strptime(day, "%Y-%m-%d").strftime("%d %b %Y").lower()
    result = captiva_request(credentials, "get_api_stores_dashboard", store_id,
                             start_date=api_day(day), end_date=api_day(day))
    matches = [d for d in (result.get("dashboards") or [])
               if str(d.get("dashdate") or "").strip().lower() == target]
    if len(matches) != 1:
        raise ValueError("Expected one Captiva dashboard entry for the requested day")
    d = matches[0]
    kpis = (d.get("report") or {}).get("kpis") or {}
    mandatory = ("gross_all_sales", "total_all_net_sales", "total_all_vat",
                 "total_all_std_orders")
    if any(kpis.get(key) is None for key in mandatory):
        raise ValueError("Captiva dashboard is missing mandatory accounting fields")
    gross = money(kpis["gross_all_sales"])
    net = money(kpis["total_all_net_sales"])
    vat = money(kpis["total_all_vat"])
    count = int(kpis["total_all_std_orders"])
    if min(gross, net, vat) < 0 or count < 0:
        raise ValueError("Unexpected negative daily finance figures")
    if abs(gross - net - vat) > Decimal("0.02"):
        raise ValueError("Captiva dashboard gross, net and VAT do not reconcile")
    return {
        "official_gross": euros(gross),
        "official_net": euros(net),
        "official_vat": euros(vat),
        "official_orders": count,
    }


def get_final_journal(credentials, store_id, day):
    listing = captiva_request(credentials, "get_api_stored_journal_list", store_id)
    expected = datetime.strptime(day, "%Y-%m-%d").strftime("%d %b %Y").lower()
    candidates = [j for j in (listing.get("journals") or [])
                  if str(j.get("journal_date") or "").strip().lower() == expected
                  and j.get("istemp") is False]
    if not candidates:
        return None, None, "dashboard_only"
    if len(candidates) != 1:
        return None, None, "multiple_journals_requires_review"
    filename = str(candidates[0].get("journal_name") or "")
    if not JOURNAL_NAME.fullmatch(filename):
        raise ValueError("Invalid Captiva journal filename")
    response = captiva_request(credentials, "get_api_store_journal_byid",
                               store_id, journal_id=filename)
    return filename, decode_journal(response), "complete"


def summarize_products(root):
    """Product *observations*, not receipts or financial turnover."""
    aggregate = {}
    for order in root.findall("./orders/order"):
        for item in order.findall("./products/product"):
            product_id = str(item.get("prodid") or "")
            if not SAFE_PRODUCT_ID.fullmatch(product_id):
                raise ValueError("Product has no safe native Captiva identifier")
            quantity = money(item.get("qty"))
            raw_value = quantity * money(item.get("sellprice"))
            if abs(quantity) > 10000 or abs(raw_value) > Decimal("10000000"):
                raise ValueError("Product exceeds safe import limits")
            k = (product_id, item.get("type") or "untyped")
            current = aggregate.setdefault(k, {
                "product_id": product_id,
                "product_type": k[1][:50],
                "description": (item.get("description") or "")[:150],
                "quantity": Decimal("0"),
                "raw_value": Decimal("0"),
                "lines": 0,
            })
            current["quantity"] += quantity
            current["raw_value"] += raw_value
            current["lines"] += 1
    return [
        {
            "product_id": v["product_id"],
            "product_type": v["product_type"],
            "description": v["description"],
            "quantity": str(v["quantity"]),
            "raw_value_not_revenue": euros(v["raw_value"]),
            "lines": v["lines"],
        }
        for k, v in sorted(aggregate.items())
    ]


def summarize_payments(root):
    totals = {"standard": Decimal("0"), "refund": Decimal("0"), "other": Decimal("0")}
    count = 0
    for order in root.findall("./orders/order"):
        for payment in order.findall("./payments/payment"):
            status = (payment.get("status") or "").lower().strip()
            category = status if status in ("standard", "refund") else "other"
            totals[category] += money(payment.get("value"))
            count += 1
    return {
        "journal_standard_payments": euros(totals["standard"]),
        "journal_refund_payments": euros(totals["refund"]),
        "journal_other_payments": euros(totals["other"]),
        "journal_payment_records": count,
    }


def classify_event(code, desc):
    uc = (code or "").upper().strip()
    text = (desc or "").lower()
    if uc in EVENT_CODES:
        return EVENT_CODES[uc]
    if uc == "SERCHG" and "delete" in text:
        return "service_charge_deleted"
    if "void" in uc or "void" in text:
        return "possible_void"
    if "cancel" in uc or "cancel" in text:
        return "possible_cancellation"
    return None


def summarize_events(root, filename):
    events = []
    identifiers_seen = set()
    possible_without_identity = 0
    history_attributes = set()
    order_attributes = set()
    for order in root.findall("./orders/order"):
        order_attributes.update(order.attrib)
        order_header = order.find("./header")
        if order_header is not None:
            order_attributes.update("header." + k for k in order_header.attrib)
        for event in order.findall("./history/histdata"):
            history_attributes.update(event.attrib)
            code = (event.get("code") or "").strip()
            kind = classify_event(code, event.get("desc"))
            if not kind:
                continue
            native_id = (event.get("id") or "").strip()
            system_id = (event.get("systemid") or "").strip()
            timestamp_parts = [event.get("date") or "", event.get("time") or "",
                               event.get("timex") or ""]
            native = {
                "id": native_id, "systemid": system_id,
                "date": timestamp_parts[0], "time": timestamp_parts[1],
                "timex": timestamp_parts[2],
                "dvid": (event.get("dvid") or "").strip(),
                "svrid": (event.get("svrid") or "").strip(),
                "code": code,
            }
            # Never use journal-local array position as a permanent event ID.
            # Missing native identity causes this journal's event ingestion
            # to be marked requires_identity_review, not silently staged.
            if not native_id or not system_id or not any(timestamp_parts):
                possible_without_identity += 1
                continue
            fingerprint = sha256({"journal_filename": filename, "native": native})
            if fingerprint in identifiers_seen:
                raise ValueError("Duplicate native exception identifiers in journal")
            identifiers_seen.add(fingerprint)
            raw_amount = event.get("val")
            amount = euros(raw_amount) if raw_amount not in (None, "") else None
            removed = re.search(r"Removing\s+(\d+)\s+items",
                                event.get("desc") or "", re.I)
            op_code = (event.get("vposuser") or "").strip()[:80]
            if not op_code:
                # Some service-charge deletions identify the POS operator in
                # the event description rather than the vposuser attribute.
                user_match = re.search(r"by user:\s*([^\r\n]{1,80})",
                                       event.get("desc") or "", re.I)
                if user_match:
                    op_code = user_match.group(1).strip()[:80]
            events.append({
                "source_event_key": fingerprint,
                "event_code": code[:80],
                "event_type": kind,
                "original_amount": amount,
                "removed_item_count": int(removed.group(1)) if removed else None,
                "source_operator": op_code if op_code else None,
                "source_date_text": (event.get("date") or "").strip()[:50] or None,
                "source_time_text": (event.get("time") or "").strip()[:50] or None,
            })
    return {
        "events": events,
        "unidentified_exception_count": possible_without_identity,
        "history_attribute_names": sorted(history_attributes),
        "order_attribute_names": sorted(order_attributes),
    }



def extract_void_orders(root, filename, store_id, day):
    """Read-only, privacy-minimised VOID investigations.

    Kept OUT of the v1 ingestion envelope until the receiving backend has
    explicit schema, validation and tenant-bound authorization for these rows.
    Amounts are audit observations, never assumed lost revenue.
    """
    records = []
    seen = set()
    for order in root.findall("./orders/order"):
        header = order.find("./header")
        if header is None or (header.get("orderstatus") or "").strip().upper() != "VOID":
            continue
        number = (header.get("ordnum") or "").strip()
        system = (header.get("systemid") or "").strip()
        order_cd = (header.get("ordercdid") or "").strip()
        if not number or not system or not order_cd:
            raise ValueError("VOID order missing native identity")
        identity = {"store_id": store_id, "trading_date": day,
                    "systemid": system, "ordercdid": order_cd, "ordnum": number}
        key = sha256(identity)
        if key in seen:
            raise ValueError("Duplicate VOID order identity")
        seen.add(key)
        items = []
        for p in order.findall("./products/product"):
            pid = (p.get("prodid") or "").strip()
            if not SAFE_PRODUCT_ID.fullmatch(pid):
                raise ValueError("VOID item missing safe native product ID")
            qty = money(p.get("qty"))
            price = money(p.get("sellprice"))
            if abs(qty) > 10000 or abs(price * qty) > Decimal("10000000"):
                raise ValueError("VOID product exceeds safe limits")
            items.append({"product_id": pid, "description": (p.get("description") or "")[:150],
                          "quantity": str(qty), "unit_price": euros(price),
                          "line_value_not_loss": euros(qty * price)})
        history = []
        event_ids = set()
        for event in order.findall("./history/histdata"):
            code = (event.get("code") or "").strip()[:80]
            native_id = (event.get("id") or "").strip()
            event_system = (event.get("systemid") or "").strip()
            event_date = (event.get("date") or "").strip()
            event_time = (event.get("time") or "").strip()
            event_timex = (event.get("timex") or "").strip()
            # Keep a timeline even when Captiva omits event IDs, but never
            # invent a durable event key from a list position.
            event_key = None
            if native_id and event_system and (event_date or event_time or event_timex):
                event_key = sha256({"journal_filename": filename, "native": {
                    "id": native_id, "systemid": event_system,
                    "date": event_date, "time": event_time, "timex": event_timex,
                    "dvid": (event.get("dvid") or "").strip(),
                    "svrid": (event.get("svrid") or "").strip(),
                    "code": code}})
                if event_key in event_ids:
                    raise ValueError("Duplicate native VOID history event identity")
                event_ids.add(event_key)
            raw_value = event.get("val")
            history.append({
                "source_event_key": event_key, "code": code,
                "date_text": event_date[:50] or None,
                "time_text": event_time[:50] or None,
                "operator": (event.get("vposuser") or "").strip()[:80] or None,
                "recorded_value": euros(raw_value) if raw_value not in (None, "") else None,
            })
        void_events = [h for h in history if h["code"].upper() == "VOID"]
        if not void_events:
            raise ValueError("VOID status without explicit VOID history event")
        last_void = void_events[-1]
        reason = (header.get("voidreason") or "").strip()
        category = (header.get("voidcategory") or "").strip()
        records.append({
            "source_order_key": key, "store_id": store_id, "trading_date": day,
            "order_number": number,
            "sale_date_text": (header.get("saledate") or "").strip()[:50] or None,
            "sale_time_text": (header.get("saletime") or "").strip()[:50] or None,
            "order_operator": (header.get("vposuser") or "").strip()[:80] or None,
            "void_operator": last_void["operator"],
            "void_date_text": last_void["date_text"],
            "void_time_text": last_void["time_text"],
            "recorded_void_value_not_loss": last_void["recorded_value"],
            "void_reason": reason[:150] if reason else None,
            "void_category": category[:80] if category and category.lower() != "no category" else None,
            "products": items, "history": history,
            "requires_manager_review": True, "financial_loss_verified": False,
        })
    return records


def build_envelope(credentials, store_id, day):
    if store_id not in STORES:
        raise ValueError("Unknown store")
    fin = dashboard(credentials, store_id, day)
    filename, root, coverage = get_final_journal(credentials, store_id, day)
    issues = []
    events, products = [], []
    payments = None
    event_identity = {"unidentified_exception_count": 0}
    if coverage == "complete":
        orders = root.findall("./orders/order")
        # Captiva's dashboard reports STANDARD orders, while its journal can
        # also contain fully VOID orders. Do not discard voids or accept
        # unknown statuses as completed orders.
        statuses = [(o.find("./header").get("orderstatus") or "").strip().lower()
                    if o.find("./header") is not None else "" for o in orders]
        standard_orders = sum(status in ("std", "") for status in statuses)
        void_orders = sum(status == "void" for status in statuses)
        unknown_statuses = sorted(set(statuses) - {"std", "", "void"})
        if unknown_statuses:
            issues.append("Unknown Captiva journal order statuses require review")
        if fin["official_orders"] != standard_orders:
            # Journal mismatches are not evidence of zero events.
            issues.append("Dashboard and journal standard-order counts differ")
        extracted = summarize_events(root, filename)
        event_identity = {
            "unidentified_exception_count": extracted["unidentified_exception_count"],
            "history_attribute_names": extracted["history_attribute_names"],
            "order_attribute_names": extracted["order_attribute_names"],
        }
        if extracted["unidentified_exception_count"]:
            issues.append("Native history identifiers missing for some exception events")
        events = extracted["events"]
        products = summarize_products(root)
        payments = summarize_payments(root)
        if len(products) > 2000 or len(events) > 2000:
            issues.append("Exceeded conservative staging row limits")
        if issues:
            coverage = "requires_review"
            events, products, payments = [], [], None
    elif coverage == "multiple_journals_requires_review":
        coverage = "requires_review"
        issues.append("Multiple finalised XML journals for a date")
    # Cloud gross/net/VAT is authoritative, NEVER sum raw product values.
    snapshot = {
        "store_id": store_id,
        "trading_date": day,
        "journal_filename": filename if coverage == "complete" else None,
        "journal_coverage": coverage,
        **fin,
        "journal_standard_payments": payments["journal_standard_payments"] if payments else None,
        "journal_refund_payments": payments["journal_refund_payments"] if payments else None,
        "journal_other_payments": payments["journal_other_payments"] if payments else None,
        "journal_payment_records": payments["journal_payment_records"] if payments else None,
    }
    return {
        "version": 1,
        "snapshot": snapshot,
        "events": events,
        "products": products,
        # Includes all sanitized evidence, not just the daily dashboard.
        # A correction to products or events must produce a distinct source version.
        "source_fingerprint": sha256({"snapshot": snapshot, "events": events, "products": products}),
        "issues": issues,
        "diagnostic_identity": event_identity,
        "safe_to_stage": coverage in ("complete", "dashboard_only"),
        "reconciled": False,
    }


def export_summary(envelope):
    doc = envelope["snapshot"]
    return {
        "store_id": doc["store_id"],
        "trading_date": doc["trading_date"],
        "official_gross": doc["official_gross"],
        "official_orders": doc["official_orders"],
        "journal_standard_payments": doc["journal_standard_payments"],
        "journal_refund_payments": doc["journal_refund_payments"],
        "standard_payments_minus_official_gross_DIAGNOSTIC":
            euros(money(doc["journal_standard_payments"]) - money(doc["official_gross"]))
            if doc["journal_standard_payments"] is not None else None,
        "journal_coverage": doc["journal_coverage"],
        "exceptions": len(envelope["events"]) if doc["journal_coverage"] == "complete" else None,
        "products": len(envelope["products"]) if doc["journal_coverage"] == "complete" else None,
        "safe_to_stage": envelope["safe_to_stage"],
        "issues": envelope["issues"],
        "identity_diagnostic": envelope["diagnostic_identity"],
        "reconciled": False,
    }


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Build Captiva staging data without writes")
    parser.add_argument("--date", required=True)
    parser.add_argument("--store", choices=list(STORES))
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()
    if (args.store is None) == (not args.all):
        parser.error("Choose exactly one of --store or --all")
    creds = load_credentials()
    for store in (list(STORES) if args.all else [args.store]):
        try:
            data = build_envelope(creds, store, args.date)
            print(json.dumps(export_summary(data), indent=2, ensure_ascii=False))
        except Exception as exc:
            print("%s: staging preview unavailable: %s" % (store, type(exc).__name__))
