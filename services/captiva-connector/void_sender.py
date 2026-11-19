#!/usr/bin/env python3
"""Signed VOID evidence preview; staging is opt-in and separately server gated."""
import argparse
import json
import sys
from sender import load_sender_config, sign_payload, PROJECT_FUNCTION_URL
from staging import canonical_json, sha256, get_final_journal, extract_void_orders, load_credentials
import time
import uuid
import urllib.request
import urllib.error

ENDPOINT = PROJECT_FUNCTION_URL.replace("/pos-captiva-ingest", "/pos-captiva-void-ingest")

def build(credentials, store, day):
    filename, root, coverage = get_final_journal(credentials, store, day)
    if coverage != "complete" or root is None:
        raise ValueError("Final Captiva journal required")
    records = extract_void_orders(root, filename, store, day)
    evidence = {"store_id":store,"trading_date":day,"journal_filename":filename,"void_orders":records}
    return dict(version=1, source_fingerprint=sha256(evidence), **evidence)

def send(document, mode):
    config = load_sender_config()
    raw = canonical_json(document)
    if len(raw)>1048576:
        raise ValueError("VOID payload exceeds safe limit")
    request_id = str(uuid.uuid4())
    timestamp = int(time.time())
    signature = sign_payload(config["hmac_secret"],timestamp,request_id,mode,raw)
    request = urllib.request.Request(ENDPOINT,raw,headers={
        "Content-Type":"application/json",
        "x-captiva-timestamp":str(timestamp),
        "x-captiva-request-id":request_id,
        "x-captiva-mode":mode,
        "x-captiva-signature":signature,
    },method="POST")
    try:
        with urllib.request.urlopen(request,timeout=40) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError("VOID endpoint returned HTTP %s" % error.code)
    except urllib.error.URLError:
        raise RuntimeError("VOID endpoint unreachable")

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("mode",choices=["local-preview","send-preview","stage"])
    parser.add_argument("--store",required=True)
    parser.add_argument("--date",required=True)
    parser.add_argument("--confirm-void-staging-only",action="store_true")
    args=parser.parse_args()
    if args.mode=="stage" and not args.confirm_void_staging_only:
        raise ValueError("Explicit staging confirmation required")
    doc=build(load_credentials(),args.store,args.date)
    print(json.dumps({"store_id":args.store,"date":args.date,"void_count":len(doc["void_orders"]),"source_fingerprint":doc["source_fingerprint"]}))
    if args.mode!="local-preview":
        print(json.dumps(send(doc,"stage" if args.mode=="stage" else "preview")))

if __name__=="__main__":
    try:main()
    except (RuntimeError,ValueError) as error:
        print(str(error),file=sys.stderr)
        sys.exit(1)
