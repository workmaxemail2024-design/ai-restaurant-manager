# Captiva POS — audit findings and smallest safe plan

## 1. What is actually running today

**Live path:** POS Integrations screen → `pos-sync-captiva` → (auto-apply) → `pos-apply-import` → `sales` + `pos_daily_summaries`.

**Retired and not involved** (all return 410): `captiva-sync`, `captiva-webhook-handler`, `pos-import-sales`, `pos-webhook-handler`. They only occupy space; nothing calls them.

**Still involved:** `captiva-schedule-sync` — a working end-of-day batch runner that already chains sync → apply per integration, but only for integrations whose settings contain `auto_sync_daily: true`.

## 2. Credentials and endpoint

One Captiva integration exists, for one location (Pizzeria La Scala, outlet code `02137`), status active. Credentials live in `pos_integrations.settings`: `base_url`, `store_id`, `api_key`, `api_account_name`, `api_password`. No secrets are exposed to the browser; every call is made server-side.

Endpoint called: `https://mycaptivaserver001.azurewebsites.net/CaptivaCloudAPIRequest.ashx`, POST JSON, trying request types `GetSales`, `GetJournals`, `GetProductSales`, `GetSalesJournal` in turn.

## 3. Can the live API currently return sales data? No.

Every attempt returns HTTP 200 with a Captiva error body and **zero rows**:

- JSON body, form-encoded, multipart and query-string: `115403 — Error user id required` (even when a UserID was supplied).
- XML body: `306610 — Error loading request` — Captiva treated the XML as a *file path* on its own server, so that format is definitely wrong.

So today it can retrieve **no** product sales, gross sales or order count. Visitor/covers is not part of the product report at all — in the manual import the Owner types it in.

**Classification: Captiva-side request-contract restriction.** Not our authentication, not the endpoint host, not payload mapping, not location mapping, not the canonical import path. The missing piece is the exact request envelope and the meaning of `UserID` — that has to come from Captiva.

## 4. Outlet / multi-location

We send `OutletCode`. Because no successful response has ever been received, there is **no evidence** of how Captiva labels outlets in a response or whether one response can carry several outlets. This cannot be answered from our side — it needs one real sample response.

The only proven multi-outlet identifier we have is in the XLS export: one worksheet per store plus an "All Stores" sheet. That is a sheet *name*, not a stable code, so it must be mapped by a human, never guessed.

## 5. Scheduler state

**There is no scheduled job.** `cron.job` is empty. The original migration also built the call with `current_setting('app.settings.service_role_key')`, which is unset — it would have sent `Bearer ` and been rejected anyway. Nothing has run automatically; every log entry came from a manual button press.

## 6. Sync logs

Last real activity 11–12 Jul 2026: repeated "returned 0 rows" plus the diagnostic errors above. One later entry (28 Aug) is a rejected inbound webhook — expected, that route is retired.

## 7. Is the canonical idempotent path safe to receive API results? Yes, with one fix.

Staging upserts on `(restaurant_id, location_id, pos_provider, external_sale_id)`; apply skips already-applied rows, upserts `sales` on `pos_import_id`, and pre-checks closed days (single day → refuse with 409, range → skip that day). Retries are safe.

**One real bug:** when a Captiva row has no receipt identifier, `pos-sync-captiva` invents `${Date.now()}-${Math.random()}` as the external id. A retry would then create duplicates. Must be fixed before any live import is trusted.

---

# Smallest safe plan

## Phase A — end-of-day sync (no new architecture)

1. **Fix the duplicate risk**: replace the random fallback external id with a deterministic one derived from location + date + row content; if no stable identity can be derived, fail that row and report it rather than staging it.
2. **Re-create the nightly job properly**: one `pg_cron` entry per day calling `captiva-schedule-sync` with the cron secret header (the shared header `posAuth` already accepts), not an unset database setting. Run once per trading day after close, per location, for the previous operating day.
3. **Reuse `captiva-schedule-sync` as-is** — it already resolves the integration and location server-side, calls the canonical path, and never advances the success checkpoint on partial runs.
4. **Owner visibility**: guarantee one clear success/failure row in POS Sync Logs per location per night, carrying Captiva's own error text, and surface the last result on the POS Integrations screen.
5. **Leave request-format guessing alone** until Captiva confirms the contract. Add one place to record a real sample response so outlet identity can be confirmed from evidence.

Blocked on Captiva: the correct request envelope and what `UserID` must contain. Until then the nightly job will run and log a clear, honest failure rather than silently importing nothing.

## Phase B — multi-location preview for the manual XLS import

Add a preview step to the existing dialog before anything is written:

- Detect every store sheet in the workbook (excluding "All Stores" and "No Activity").
- Show row count, total quantity and total gross per detected store.
- Auto-match a sheet to a known location only on an exact, unambiguous name match; everything else is flagged Unknown.
- Per store the Owner chooses: Map to existing location / Add new location / Skip.
- Import only runs after confirmation, uses the existing idempotent per-location path, and never creates a location without an explicit choice.

No change to POS calculations, closed-day rules, permissions, RLS or location scoping.
