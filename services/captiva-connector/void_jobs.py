"""Import closed-day void journals using the Oracle connector's existing credentials."""
import argparse
from datetime import date, datetime, timedelta
from pathlib import Path
import sqlite3
import sys
import time

from connector import STORES, captiva_request, load_credentials
from sender import previous_trading_date
from void_sender import build, send


def journal_days(listing, start, end):
    journals = listing.get("journals")
    if not isinstance(journals, list):
        raise ValueError("Captiva did not return a journal list")
    days = set()
    for journal in journals:
        if journal.get("istemp") is False:
            day = datetime.strptime(journal["journal_date"].strip(), "%d %b %Y").date()
            if start <= day <= end:
                days.add(day.isoformat())
    return sorted(days, reverse=True)


def import_day(credentials, store, day, db, proof=False):
    document = build(credentials, store, day)
    count = len(document["void_orders"])
    if proof and not any(h.get("code", "").upper() == "VOID" and h.get("source_event_key")
                         for order in document["void_orders"] for h in order["history"]):
        raise ValueError("No linkable VOID event in proof journal")
    fingerprint = document["source_fingerprint"]
    known = db.execute("select fingerprint from processed where store=? and day=?", (store, day)).fetchone()
    if not proof and known == (fingerprint,):
        return
    response = send(document, "stage")
    result = response.get("result") or {}
    if (response.get("success") is not True or response.get("revenue_changed") is not False
            or type(result.get("inserted")) is not int or not 0 <= result["inserted"] <= count):
        raise RuntimeError("Import acknowledgement unavailable")
    with db:
        db.execute("insert or replace into processed values (?,?,?)", (store, day, fingerprint))
    print(store, day, "orders in journal:", count, "newly saved:", result["inserted"], flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--proof", action="store_true")
    mode.add_argument("--nightly", action="store_true")
    mode.add_argument("--backfill-from", type=date.fromisoformat)
    args = parser.parse_args()
    end = date.fromisoformat(previous_trading_date())
    credentials = load_credentials()
    folder = Path.home() / ".local/state/restaurantai-captiva"
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    with sqlite3.connect(folder / "void-details.sqlite", timeout=60) as db:
        db.execute("create table if not exists processed (store text, day text, fingerprint text, primary key(store,day))")
        if args.proof:
            import_day(credentials, "01584", "2026-11-19", db, proof=True)
            return 0
        start = args.backfill_from or end - timedelta(days=2)
        failed = False
        for store in STORES:
            try:
                listing = captiva_request(credentials, "get_api_stored_journal_list", store)
                days = journal_days(listing, start, end)
                if end.isoformat() not in days:
                    print(store, end, "final journal unavailable", flush=True)
                for day in days:
                    try:
                        import_day(credentials, store, day, db)
                    except ValueError as error:
                        print(store, day, str(error), file=sys.stderr, flush=True)
                        failed = True
                    time.sleep(0.35)
            except (RuntimeError, ValueError, OSError, KeyError) as error:
                print(store, "import incomplete:", str(error), file=sys.stderr, flush=True)
                failed = True
        return int(failed)


if __name__ == "__main__":
    sys.exit(main())
