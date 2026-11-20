"""Backfill completed Dublin trading days through the existing signed staging endpoint."""
import argparse
from collections import Counter
from datetime import date, timedelta
from decimal import Decimal
import fcntl
from pathlib import Path
import sqlite3
import time
import uuid

from connector import STORES, load_credentials
from sender import deliver, previous_trading_date
from staging import build_envelope


def run_history(start, end, stores, db, fetch, send, pause=time.sleep):
    db.execute("""create table if not exists staged (
        store text, day text, source_id text, primary key(store, day))""")
    counts = Counter()
    for offset in range((end - start).days + 1):
        day = (start + timedelta(days=offset)).isoformat()
        for store in stores:
            if db.execute("select 1 from staged where store=? and day=?", (store, day)).fetchone():
                counts["previously staged"] += 1
                continue
            try:
                envelope = fetch(store, day)
                if not envelope["safe_to_stage"] or envelope["issues"]:
                    raise ValueError("Source review required")
                result = send(envelope)["result"]
                source_id = str(uuid.UUID(result["source_id"]))
                if result["revenue_changed"] is not False:
                    raise RuntimeError("Unexpected staging response")
                with db:
                    db.execute("insert into staged values (?, ?, ?)", (store, day, source_id))
                snapshot = envelope["snapshot"]
                payments = snapshot["journal_standard_payments"]
                variance = "unknown" if payments is None else str(Decimal(str(payments)) - Decimal(str(snapshot["official_gross"])))
                print(day, store, "staged", snapshot["journal_coverage"], "payment variance", variance, flush=True)
                counts["staged"] += 1
            except ValueError:
                print(day, store, "source requires review", flush=True)
                counts["review"] += 1
            except (RuntimeError, OSError, KeyError, TypeError) as error:
                print(day, store, "run stopped:", type(error).__name__, flush=True)
                raise SystemExit(1) from None
            pause(0.35)
    print(dict(counts), flush=True)
    return 2 if counts["review"] else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from-date", required=True, type=date.fromisoformat)
    parser.add_argument("--through", required=True, type=date.fromisoformat)
    parser.add_argument("--confirm-staging-only", required=True, action="store_true")
    args = parser.parse_args()
    if not args.from_date <= args.through <= date.fromisoformat(previous_trading_date()):
        parser.error("Choose an ordered range of completed Dublin trading dates")
    folder = Path.home() / ".local/state/restaurantai-captiva"
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (folder / "history.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.exit(1, "A history run is already active\n")
        credentials = load_credentials()
        with sqlite3.connect(folder / "history.sqlite") as db:
            raise SystemExit(run_history(args.from_date, args.through, STORES, db,
                lambda store, day: build_envelope(credentials, store, day),
                lambda envelope: deliver(envelope, mode="stage")))
