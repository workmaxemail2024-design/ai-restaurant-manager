# RestaurantAI — Captiva operational exceptions and financial controls

Status: design specification (not deployed). Related issues: #3 (Gourmet Pizza Factory journal gap), #4 (exception review). Draft connector in PR #2.

## Non-negotiable accounting model

- Captiva dashboard gross/net/VAT/orders are **source-reported facts**; persist unchanged with source timestamp, original store ID, trading date and freshness/coverage markers.
- Captiva journal product lines and event history are raw POS evidence; a line value is **not** authoritative revenue until combo, historic modifications, voids, refunds and payment allocation are reconciled.
- Manager notes, a 'paid later' resolution or a close sign-off **do not mutate** Captiva-reported sales.
- A verified recovered payment is a *separate* adjustment with amount, method, verification evidence, reviewer identity, verified timestamp and a flag preventing duplication of an existing POS payment or prior adjustment.
- If a dashboard exists but the corresponding journal is missing: display dashboard KPIs, `detail_unavailable`; refund/void/cancellation counts and product units are `null`/unknown, **not zero**. No detail-based daily clearance allowed.

## Suggested data entities (proposed; no SQL migration deployed)

| Entity | Key properties | Purpose |
|---|---|---|
| `captiva_daily_sources` | restaurant_id, location_id, store_id, trade_date, gross/net/vat/orders, source_hash, fetched_at, journal_coverage | Immutable observed POS reporting baseline; version source corrections rather than silently overwrite |
| `pos_journal_files` | restaurant_id, location_id, store_id, journal_filename, journal_date, source_hash, fetched_at, validation_state | Track downloaded journals and missing days; unique on tenant/store/filename |
| `pos_exception_events` | restaurant_id, location_id, event_fingerprint, journal_filename, order_key, raw_code, event_type, event_time, source_operator, original_amount, raw_evidence_ref, classification_state | Idempotent POS audit event ledger without card/customer data; never overwrite original facts |
| `pos_exception_reviews` | exception_id, status, resolution, note, assigned_to, updated_by, reviewed_at | Current manager-facing state only; no direct revenue effect |
| `pos_exception_review_audit` | exception_id, actor_id, action, old/new status, note, created_at | Append-only record of notes, amendments and approvals |
| `pos_recovery_claims` | exception_id, verified_payment_amount, payment_method, payment_reference, evidence_ref, paid_at, verified_by, already_in_pos, accounting_state | Verified additional cash/card recoveries; do not post until reconciliation/approval |
| `pos_daily_signoffs` | location_id, trade_date, signed_off_by, signed_off_at, exception_coverage, unresolved_count, reconciliation_status | Approved daily close; must flag unavailable evidence |
| `pos_notification_deliveries` | location_id, trade_date, notification_kind, recipient, payload_revision, delivered_at, outcome | Idempotent EOD and morning summary deliveries |

Use existing RestaurantAI schemas or table names if equivalent entities already exist. Do not add duplicate records/tables blindly.

## Event identity and classification

Raw journal XML provides order history (`histdata`) including `id`, `systemid`, `date`, `time`, `timex`, `vposuser`, `desc`, `val`, `dvid`, `svrid`, `code`; order and product attributes need a stable receipt/order identifier verified against real journal examples. Do not use in-memory `order_position` as a permanent identity. Proposed event fingerprint hashes tenant/location, full journal filename, stable order key, stable event id + event code + native timestamp. Validate collision behavior using multiple days and stores.

Classify confirmed `REFUND`, `REMITEMS` and service-charge `SERCHG` delete events; preserve raw codes and mark others unknown until investigated. An `ORDER`, `BUILDORD`, `FDORDER`, `RECALL`, or `SPLITORD` event alone is not proof of a cancelled sale or misconduct. Refunded payment totals are **audit facts**, not an automatic deduction from gross revenue.

## Manager review workflow

Open -> Reviewing -> Resolved; any resolution may be reopened with a mandatory reason and audit entry. Supported resolutions: `paid_and_pos_recorded`, `paid_outside_pos_pending_verification`, `paid_outside_pos_verified`, `confirmed_unpaid`, `legitimate_cancellation`, `invalid_event`, `pending_information`. Manager notes may contain explanations and optionally references to supporting documents; they are never the accounting adjustment themselves.

A recovered payment requires amount (decimal currency), payment method, date, proof or linked POS transaction, and authorisation; only finance-approved, verified amounts that aren't already reflected in the POS may flow into separately labelled adjusted totals. Prevent two reviewers from claiming the same payment by unique verification references and transaction-level idempotency.

## UI requirements for Lovable

- Per-store daily dashboard: POS gross, VAT, official orders; separate status indicator `complete / dashboard-only / discrepancy / pending`.
- Exceptions review table with date/time, type, value where known, POS user where present, reference, reason, assigned manager, and status.
- Detail drawer: original Captiva facts are read-only; manager note, resolution and evidence upload require appropriate permissions; display audit trail and verified accounting treatment.
- Morning briefing: overview of previous trading date in Europe/Dublin, unresolved exceptions, journal gaps, revenue reconciliation and links to review.
- Distinct totals: POS-reported, verified recoveries not in POS, adjusted/reconciled. Never imply a manager note alone 'confirmed' numbers.

## Verified sample data and known gaps

- Rudy's (01584), 2026-09-01: 28 orders, gross EUR 2,398.45, standard payments EUR 2,400.75, refund record EUR 420.60, removed-items event, service-charge deletions. Raw product value EUR 3,837.95 is NOT revenue; EUR 2.30 payment/gross difference unclassified.
- Maximilian's (02137), 2026-09-01: gross EUR 2,473.70, 16 orders, standard payments equal gross. Raw product value EUR 4,495.60 not revenue; removed-items and service-charge deletion audit events.
- Gourmet Pizza Factory (02136), 2026-09-01: gross EUR 2,396.81, net EUR 2,178.09, 53 orders via dashboard; journal not available. Latest journal in 467-file list is 2025-10-06. Requires Captiva support check before recent item-level reporting.

## Security and rollout gates

Adopt location/restaurant-bound authorization, never user-provided tenant scope, separate manager and owner permissions, RLS for any exposed table, server-only connector secrets, no cardholder/pan/cvv/customer data in event logs, secure evidence storage, closed-day enforcement even under service-role, append-only audit actions.

Rollout: schema/permissions review -> synthetic tests -> real read-only journal backtest -> staged import preview -> comparison with Captiva gross/net/VAT/refunds -> controlled approval -> live updates -> schedule EOD/morning notifications with delivery deduplication. Keep existing XLS importer operational until validated.