#!/usr/bin/env python3
"""Captiva -> RestaurantAI signed delivery client (Python 3.9 stdlib).

Read-only by default. No Supabase service-role credentials ever stored on Oracle.
All journal content is reduced to finance snapshot + scrubbed audit observations.
"""
import argparse
import getpass
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import sys
import time
import urllib.error
import urllib.request
import uuid

from connector import CONFIG_FILE, STORES, load_credentials, write_json_private
from staging import build_envelope, canonical_json, export_summary

PROJECT_FUNCTION_URL = (
    "https://bjykbjpyodowzstfqoge.supabase.co/functions/v1/pos-captiva-ingest"
)
INGEST_CONFIG = CONFIG_FILE.parent / "ingest.json"


def configure():
    print("Use a dedicated random HMAC key (48+ characters).")
    print("Create it in a password manager and save it in Supabase Edge Function Secrets")
    print("as CAPTIVA_INGEST_HMAC_KEY, then paste the SAME value below.")
    print("This is not your Captiva password or Supabase service-role key.")
    secret = getpass.getpass("Paste your Supabase CAPTIVA_INGEST_HMAC_KEY (hidden): ").strip()
    if len(secret) < 48:
        raise ValueError("Signing key must contain at least 48 characters")
    write_json_private(INGEST_CONFIG, {
        "endpoint": PROJECT_FUNCTION_URL,
        "hmac_secret": secret,
    })
    print("Private Oracle sender settings securely saved at:", INGEST_CONFIG)
    print("Signing key was NOT printed. Keep CAPTIVA_INGEST_ENABLED disabled")
    print("until a signed preview is validated and staging is approved.")


def load_sender_config():
    if not INGEST_CONFIG.exists():
        raise ValueError("Sender not configured; run python3 sender.py configure first")
    file = INGEST_CONFIG.stat()
    if file.st_mode & 0o077:
        raise ValueError("Sender settings are not private; chmod 600 the config")
    settings = json.loads(INGEST_CONFIG.read_text(encoding="utf-8"))
    if settings.get("endpoint") != PROJECT_FUNCTION_URL:
        raise ValueError("Unexpected ingestion endpoint")
    secret = settings.get("hmac_secret") or ""
    if len(secret) < 48:
        raise ValueError("Ingestion signing key missing or too short")
    return settings


def sign_payload(secret, unix_time, request_id, mode, encoded):
    if mode not in ("preview", "stage"):
        raise ValueError("Unknown Captiva ingestion operation")
    prefix = ("%s.%s.%s." % (unix_time, request_id, mode)).encode("ascii")
    return hmac.new(secret.encode("utf-8"), prefix + encoded,
                    hashlib.sha256).hexdigest()


def deliver(envelope, mode="preview", sender=None, request_id=None, unix_time=None):
    if not envelope.get("safe_to_stage") or envelope.get("issues"):
        raise ValueError("Source date requires review: not eligible for ingestion")
    if mode not in ("preview", "stage"):
        raise ValueError("Invalid delivery mode")
    if envelope["snapshot"]["journal_coverage"] not in ("complete", "dashboard_only"):
        raise ValueError("Journal availability is not verified")
    settings = sender if sender is not None else load_sender_config()
    request_id = request_id or str(uuid.uuid4())
    unix_time = int(unix_time if unix_time is not None else time.time())
    body = canonical_json(envelope)
    if len(body) > 1024 * 1024:
        raise ValueError("Payload exceeds safe maximum length")
    signature = sign_payload(settings["hmac_secret"], unix_time, request_id, mode, body)
    req = urllib.request.Request(
        settings["endpoint"], body, {
            "Content-Type": "application/json",
            "x-captiva-timestamp": str(unix_time),
            "x-captiva-request-id": request_id,
            "x-captiva-signature": signature,
            "x-captiva-mode": mode,
        }, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=40) as response:
            reply = json.load(response)
    except urllib.error.HTTPError as error:
        # Only log status, never HTML, body or signed headers.
        raise RuntimeError("Ingestion endpoint returned HTTP %s" % error.code)
    except urllib.error.URLError:
        raise RuntimeError("Unable to reach the ingestion endpoint")
    if reply.get("success") is not True:
        raise RuntimeError("Ingestion endpoint rejected request")
    return reply


def main():
    parser = argparse.ArgumentParser(description="Captiva signed staging sender")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("configure", help="Generate and store an Oracle-only signing key")
    preview = commands.add_parser("preview", help="Build and print a local privacy-minimised summary")
    remote = commands.add_parser("send-preview", help="Signed network check; zero DB writes")
    stage = commands.add_parser("stage", help="Staging write only, never post sales")
    for cmd in (preview, remote, stage):
        cmd.add_argument("--date", required=True)
        choice = cmd.add_mutually_exclusive_group(required=True)
        choice.add_argument("--store", choices=list(STORES))
        choice.add_argument("--all", action="store_true")
    stage.add_argument("--confirm-staging-only", action="store_true")
    args = parser.parse_args()
    if args.command == "configure":
        configure()
        return
    if args.command == "stage" and not args.confirm_staging_only:
        raise ValueError("Staging requires explicit --confirm-staging-only flag")
    credentials = load_credentials()
    for store_id in (list(STORES) if args.all else [args.store]):
        try:
            envelope = build_envelope(credentials, store_id, args.date)
            print(json.dumps(export_summary(envelope), ensure_ascii=False))
            if args.command == "preview":
                continue
            # The server validates active tenant bindings for every store.
            # Dashboard-only snapshots contain no fabricated journal details.
            result = deliver(envelope, mode="stage" if args.command == "stage" else "preview")
            print("Server response:", json.dumps(result, ensure_ascii=False))
        except Exception as error:
            print("%s: %s" % (store_id, str(error).split("\n")[0]), file=sys.stderr)
            if not args.all:
                raise


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError):
        sys.exit(1)
