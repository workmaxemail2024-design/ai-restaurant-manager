## Live Supabase staging status — 15 Nov 2026

The **additive database foundation is deployed** to RestaurantAI project `bjykbjpyodowzstfqoge`:
- `20261115144233_captiva_exception_review_staging_foundation`
- `20261115144246_captiva_versioned_hmac_ingest_staging_finance`

All eleven new tables have RLS enabled. Five new Edge Functions have been deployed: `pos-captiva-ingest` (custom HMAC, `verify_jwt=false`), `pos-captiva-briefing`, `pos-exception-review`, `pos-recovery-verify`, `pos-captiva-finance` (JWT required). Their original migration SQL is checked into `supabase/migrations/` on this feature branch.

Rudy's (01584) and Maximilian's (02137) have **inactive** store bindings only; **no staging data has been imported**. Gourmet Pizza Factory (02136) remains unbound because it has not yet been onboarded by the user. No existing sales or XLS imports were altered, no notification jobs have been scheduled, and Lovable has not been changed.

**Activation still requires** private Oracle/Supabase HMAC secret configuration; live signed-preview test; finance accounting reconciliation; review of canonical Rudy's mapping and Europe/Dublin timezone; then explicit activation of each approved store. The ingestion code defaults to disabled, and it refuses to stage for an inactive binding.

### Read-only multi-day diagnostic (Oracle)

After updating `feature/captiva-secure-ingest` on Oracle:

    cd ~/ai-restaurant-manager && git pull --ff-only
    cd services/captiva-connector
    python3 -m unittest discover -s tests -q
    python3 backtest.py --end-date 2026-11-13 --days 7 --stores 01584,02137
    python3 reconciliation.py --date 2026-09-01 --stores 01584,02137

The commands above do **not** send data to Supabase, reveal API keys or store raw journal XML. Output can be shared for review. `sender.py configure` now requests the already-configured HMAC key through a hidden prompt and never prints it. Do not paste the signing key into any chat.

---

# Captiva → RestaurantAI secure staging — backend deployed, ingestion disabled

Branch: feature/captiva-secure-ingest. Based on manager exception-review draft PR #5 and Oracle connector draft PR #2.

## Implemented
- Oracle staging.py: fetches official Captiva dashboard plus the one finalised journal per day, validates native event IDs/order counts, extracts privacy-minimised exception and product observations, never persists card/customer XML.
- Oracle sender.py: signs outbound requests with HMAC-SHA256 (shared private secret), never stores Supabase service-role credentials on Oracle; defaults to read-only preview.
- Edge Function pos-captiva-ingest: verifies HMAC, timestamp, UUID, full payload fingerprint and strict data allowlist. Requires CAPTIVA_INGEST_ENABLED=true and explicit stage mode before any staging writes.
- PostgreSQL proposed schema: explicit store/location mappings, immutable dashboard snapshots, separate journal payment/refund diagnostics, immutable event ledger, immutable raw product observations (NOT revenue), idempotent request receipts.
- Edge Function pos-captiva-briefing: authenticated manager-only daily report with official financials, audit coverage, events, outstanding manager reviews and pending recovered payments. Missing journal => unknown counts, not zero.
- Parent branch pos-exception-review endpoint: manager notes, resolution and pending recovered payment claims, append-only audit history.

## Financial rules
- Captiva official dashboard gross/net/VAT are preserved unchanged.
- Standard/refund/other journal payments are audit diagnostics. Refund entries are NOT automatically deducted from gross.
- Raw product qty times sellprice observations are NOT real revenue until combo, discount, void and refund behaviour is reconciled.
- No manager note or pending recovery claim modifies financial sales or existing XLS imports.
- Evidence fingerprint is SHA256 over the entire sanitised source snapshot and events/products, not dashboard alone.
- All ingestion remains unverified, with no sign-off or report claiming a reconciled day until independent checks pass.

## Known read-only data
- Rudy's 01584: 1 Sep 2026 gross EUR 2,398.45, standard payments EUR 2,400.75, refund event EUR 420.60, 28 orders. Difference EUR 2.30 remains unresolved.
- Maximilian's 02137: 1 Sep 2026 gross EUR 2,473.70 equals standard payments, 16 orders.
- Gourmet Pizza Factory 02136: 1 Sep 2026 gross EUR 2,396.81, 53 orders, but journal unavailable; newest listed journal 6 Oct 2025.

## Production setup blockers (GitHub issue #6)
- Only Maximilian's has a configured active Captiva integration row in the current Supabase project.
- Confirm the canonical Rudy's location because there is another similarly named location without restaurant ownership.
- Gourmet Pizza Factory is intentionally not yet onboarded in RestaurantAI. Leave the pending location unbound/inactive; allow activation later only after the user adds it and confirms ownership.
- Existing location records are set to Europe/Madrid, but the stores are in Ireland; adjust to Europe/Dublin after approval.
- No store mappings or live location data were modified by this branch.

## Secrets and activation
- SUPABASE Edge Function: configure CAPTIVA_INGEST_HMAC_KEY (random 48+ character secret); CAPTIVA_INGEST_ENABLED defaults to false and must stay false until deployment approval.
- Oracle: existing Captiva credentials stay in ~/.config/restaurantai-captiva/credentials.json, mode 0600.
- Create a dedicated random 48+ character HMAC key in a password manager, save it as CAPTIVA_INGEST_HMAC_KEY in Supabase Edge Function Secrets, and paste the same key at the hidden `python3 sender.py configure` prompt on Oracle. It stores private config in ~/.config/restaurantai-captiva/ingest.json and does not print the key.
- The ingest Edge Function has verify_jwt=false solely because a separate HMAC signature is required. Never disable the HMAC verification.

## Updating the Oracle shallow, single-branch clone

The original Oracle clone tracks only `feature/captiva-oracle-readonly`. Running `git fetch origin` alone does **not** create `origin/feature/captiva-secure-ingest`. Fetch the new ref explicitly:

    cd ~/ai-restaurant-manager
    git fetch origin refs/heads/feature/captiva-secure-ingest:refs/remotes/origin/feature/captiva-secure-ingest
    git switch -c feature/captiva-secure-ingest --track origin/feature/captiva-secure-ingest

Then run the local-only tests and staging preview documented below. The GitHub branch exists in draft PR #7; an `invalid reference` on Oracle is only a local fetch-ref issue, not a missing remote branch.

## Zero-write Oracle check, after pulling this branch
    cd ~/ai-restaurant-manager/services/captiva-connector
    python3 -m unittest discover -s tests -q
    python3 staging.py --date 2026-09-01 --all

The above only fetches Captiva API data and reports native identifier availability. It does not contact Supabase or modify any database.

Future signed read-only network test, ONLY after the Edge Function and secret are properly configured:
    python3 sender.py configure
    python3 sender.py send-preview --date 2026-09-01 --all

Do not use sender.py stage until production schema, store mappings, identity tests and financial sign-off are approved.

## Automated tests
- Python 3.9 synthetic tests: metadata/identity, refund/remove/operator extraction, product raw observations and HMAC delivery.
- Deno typecheck of manager review, HMAC ingest, daily briefing, independent recovery verification, and finance day-approval Edge Functions.
- Ephemeral PostgreSQL 16: RLS/tenant isolation, immutability, no direct browser ingestion, idempotency, confirmed sign-off safeguards and no refund deductions.

## Additional completed draft backend components
- Original Captiva journal exceptions are linked to a specific immutable source version. A later corrected journal cannot accidentally continue displaying a superseded refund in the current management view.
- A claimant cannot independently approve their recovered-payment claim. Finance-admin JWT permissions, payment evidence and already-in-POS checks are enforced.
- Separate append-only day source finance approval, referencing a cashsheet/evidence record, can unlock a replay-safe daily signoff only after all current-version exceptions and outstanding recoveries are resolved.
- Manager-only daily briefing returns the original official Captiva figures, journal payment diagnostics, finance approval status and explicitly labelled provisional external recovery amount; the existing sales ledger remains unmodified.
- Frontend contract: services/captiva-connector/LOVABLE_FRONTEND_CONTRACT.md.

## Remaining before activation
- Live HMAC secret handshake and explicit enabling of the existing *inactive* store bindings.
- Real first-day journal identity validation **passed** on 2026-09-01 (Rudy's 4 exception events and Maximilian's 2; zero unidentified IDs). Multi-day backtest remains outstanding.
- Sales allocation and menu item revenue reconciliation; existing raw sums do not equal official gross.
- Live deployment and accounting-ledger integration of the already prepared two-person recovery verification and separate provisional adjusted figures. The code exists and passes isolated tests; it is not active.
- Automatic daily scheduling and next-morning notification delivery.
- Lovable frontend.

Do not represent this integration as a live automatic data sync until the above go-live prerequisites are satisfied. Live tables and endpoints exist, but no imports, notifications or daily jobs are enabled.

## Daily staging candidate

The user-level systemd units under `systemd/` are for the existing Oracle connector account.
They target 06:30 Europe/Dublin and fetch the previous Irish calendar day for all three stores.
The sender exits nonzero when any store fails, after attempting the other stores. Successful
submissions use the existing immutable staging and replay protections. The timer does not
post revenue or approve a trading day.

Before enabling the timer, run a signed `sender.py send-preview --latest-closed-day --all`
on Oracle and confirm all three stores succeed. Confirm that the user systemd manager stays
running when the SSH session ends and that the checkout and Python paths match the service.
Inspect runs with `journalctl --user -u captiva-daily-staging.service`. After a missed day,
replay the affected date explicitly with `sender.py stage --date YYYY-MM-DD --all --confirm-staging-only`.
A persistent timer catches up the scheduled execution after downtime, while the command still
targets the latest closed day. Keep finance approval and ledger posting separate.
