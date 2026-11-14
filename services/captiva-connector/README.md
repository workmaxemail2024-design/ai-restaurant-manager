# RestaurantAI — Captiva Cloud read-only Oracle connector

This is the first **non-destructive** implementation of the Captiva Cloud Journal JSON API v1.2 connector, intended for the Oracle Linux 9 server with a whitelisted static IP.

**This program does not write to Supabase, modify restaurant revenue, send notifications, schedule any jobs, or contact Captiva write APIs.** It generates only read-only previews until the financial accounting, event classification and duplicate controls have been reviewed. Existing Captiva XLS imports remain intact.

## One-time installation on Oracle

Connect to Oracle using the previously verified SSH command, then paste these commands:

    git clone --branch feature/captiva-oracle-readonly --depth 1 https://github.com/workmaxemail2024-design/ai-restaurant-manager.git
    cd ai-restaurant-manager/services/captiva-connector
    python3 -m unittest discover -s tests -v
    python3 connector.py setup

The setup prompt asks for the Captiva **API key** and **API password**. Enter them at the Oracle prompt, not in ChatGPT or GitHub. The password does not show while being typed. The key and password are stored in ~/.config/restaurantai-captiva/credentials.json with directory permissions 0700 and file permissions 0600. This means they survive SSH disconnections; they do not appear on the command line or shell history. Rotate any previously exposed API key when practical, and rerun setup with the new credentials.

## Preview

First verify Rudy's known-good 1 September journal:

    python3 connector.py preview --date 2026-09-01 --store 01584

Then verify all three locations on an available trading date:

    python3 connector.py preview --date 2026-09-01 --all

To save a restricted-access JSON export for offline review:

    python3 connector.py preview --date 2026-09-01 --store 01584 --json-out ~/captiva-preview-2026-09-01.json

Treat this export as business-sensitive because it contains item descriptions and POS user identifiers. Do not paste the file, full XML, API keys, payment-card details or personal customer data into chat or public issues. The normal console output is aggregated and is suitable for reviewing results.

## What it handles

- Captiva JSON POST request with api_userid, api_pass, api_request and stores.
- Canonical day gross/net/VAT/orders/visitors from get_api_stores_dashboard.
- In-memory Base64/XML decode from get_api_store_journal; this documented date-based method must still be verified live.
- Order count, product-line count and product ID list, raw product sums, payment status totals, refund signals, removed items and service-charge deletions.
- **No revenue posting:** qty × sellprice can overcount combos or historic products. Rudy's 1 Sep 2026 raw line sum was EUR 3,837.95 vs canonical gross EUR 2,398.45; standard payments EUR 2,400.75, refund record EUR 420.60. These figures are not yet reconciled, and the refund must not be deducted blindly.
- No raw XML, customer details, card details or free-text audit descriptions are written to the report.

## Next implementation milestones

1. Live test the date-based get_api_store_journal request against the existing successful get_api_store_journal_byid test.
2. Reconcile combos, refund semantics, service charges, tips and all product quantities against canonical Captiva figures.
3. Identify stable order, product-line and event IDs; local order positions are **not** valid permanent identifiers for database upserts.
4. Build a tenant-aware Supabase event ledger with manager note, status, payment evidence and daily sign-off. Never permit a manager note alone to alter revenue.
5. Implement secure outbound-only Oracle-to-Supabase ingestion with preview, strict authentication, duplicate protection, closed-day safeguards and XLS import preservation.
6. Backtest all three stores, then enable daily scheduling and morning notifications.

All bundled unit tests use synthetic XML only. They never contact Captiva or Supabase.
