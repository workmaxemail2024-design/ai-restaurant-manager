#!/usr/bin/env python3
"""Read-only Captiva VOID investigation preview. No database/network writes.

Prints only limited audit fields; avoid sharing this output outside management.
"""
import argparse
import json
from staging import load_credentials, get_final_journal, extract_void_orders

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True)
    parser.add_argument("--store", default="01584")
    args = parser.parse_args()
    credentials = load_credentials()
    filename, root, coverage = get_final_journal(credentials, args.store, args.date)
    if coverage != "complete" or root is None:
        raise ValueError("Final journal unavailable; VOID preview blocked")
    records = extract_void_orders(root, filename, args.store, args.date)
    print(json.dumps({"store_id": args.store, "date": args.date,
                      "void_count": len(records), "void_orders": records},
                     indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
