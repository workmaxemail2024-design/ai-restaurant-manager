# RestaurantAI Captiva — Lovable frontend API contract (prepared, NOT deployed)

This document records the backend-to-frontend contract to implement **after** real Oracle journal validation and approved Supabase migrations. It is not an instruction to modify Lovable now. The existing XLS importer stays in place.

## Existing data and tenant model
All calls require signed-in user JWT except the HMAC-authenticated, server-to-server Oracle ingest endpoint. Restaurants/locations are always resolved from Supabase and checked against the caller's role. Captiva credentials and the Supabase service-role key never belong in the browser.

- Rudy's Captiva store 01584: map only to the confirmed canonical live location.
- Maximilian's Captiva store 02137: existing integration must be preserved.
- Gourmet Pizza Factory Captiva store 02136: user has **not onboarded this location to RestaurantAI yet**. Present as a future integration option, not as an error; leave inactive until added and mapped. Captiva's newer detailed journals are also currently unavailable.

## Read-only daily report
`supabase.functions.invoke('pos-captiva-briefing', { body: {location_id: '<UUID>', date:'2026-09-01'} })`

Daily report shape:
- `coverage`: `not_imported` | `dashboard_only` | `complete` | pending/error from source if surfaced. When dashboard-only: event counts/products/refunds are **null/unknown**, not zero.
- `official_financials`: Captiva gross, net, VAT, order count; never edited by manager notes.
- `payment_diagnostics`: journal standard, refund, other payments (only when journal complete); **not** extra revenue adjustments.
- `reconciliation_state`: `pending_finance_review` | `finance_approved`; dashboard-only remains unverified.
- `finance_approval`: approver, timestamp, evidence reference, journal-standard-vs-official-gross variance, or null.
- `exception_counts`, `exceptions`: only events linked to the **latest journal source version**, no stale corrections.
- Each event: `event_id`, `event_type`, `event_code`, POS operator (when available), native POS date/time, `original_amount`, `removed_item_count`, `review_status`, `resolution`, `manager_note`, review timestamp.
- `unresolved_count`, `pending_recoveries`, `verified_external_recoveries`, `provisional_gross_plus_verified_external_recoveries`, `signed_off`, `signed_at`.
- Provisional adjusted figure is shown separately and **is not posted to sales or the accounting ledger**.

## Manager exceptions page
Columns: location, trading date, timestamp, POS operator, source code, inferred event type, value where supplied, resolution status, pending money verification, most recent note.
Filter by location, date, event type, POS staff and review status. Event classification unknown/possible is **not** an accusation; offer review.

To add a note/update resolution:
`supabase.functions.invoke('pos-exception-review', {body:{action:'review',event_id:'<UUID>',request_id:'<new UUID>',status:'reviewing',resolution:'pending',note:'Investigating till difference'}})`
Allowed statuses: `reviewing`, `resolved`, `reopened`. Resolutions: `pending`, `paid_in_pos`, `paid_outside_pos_pending`, `confirmed_unpaid`, `legitimate_cancellation`, `invalid_event`. The user cannot self-assert verified recovery.

To claim a payment recovered (pending independent verification):
`supabase.functions.invoke('pos-exception-review', {body:{action:'claim_recovery',event_id:'<UUID>',request_id:'<UUID>',amount:'45.00',method:'cash',payment_reference:'RECEIPT-1234'}})`
Responses include `revenue_changed:false`. Duplicate requests must reuse the same request_id, not create another.

## Independent finance approval
Only finance admins or restaurant-wide owners may approve, and only for their allowed locations. The person who claimed a recovery must not approve their own claim.

Payment verification:
`supabase.functions.invoke('pos-recovery-verify', {body:{claim_id:'<UUID>',request_id:'<UUID>',decision:'verified',already_in_pos:false,note:'Cash sheet and till receipt matched'}})`
Decision can be verified or rejected. If already recorded in Captiva, set `already_in_pos:true`; its value must not be added to provisional adjusted gross. A rejection never adds revenue.

Day source approval (finance role, requires complete journal and a real supporting cashsheet reference):
`supabase.functions.invoke('pos-captiva-finance', {body:{action:'approve_source',source_id:'<UUID>',request_id:'<UUID>',note:'Checked gross, net, VAT, payments and refund details',evidence_reference:'TILL-SHEET-2026-09-01'}})`

Day sign-off (requires latest approved journal version, all current-version exception reviews resolved, no pending recovered payments):
`supabase.functions.invoke('pos-captiva-finance', {body:{action:'signoff_day',source_id:'<UUID>',request_id:'<UUID>',note:'Daily sales and exceptions reviewed'}})`
Source IDs must be returned by the daily briefing before these actions are wired; `source_id` will be added to the management-only response.

## POS integration settings page (future)
Show one Captiva Cloud configuration per physical store: store code, matched RestaurantAI location, journal coverage, last verified sync/last successful date, HMAC staging status and current integration state.
Statuses: `Not configured`, `Prepared — not activated`, `Read-only verification`, `Active staging`, `Journal missing`, `Reconciliation blocked`.
Allow adding a restaurant/location later without silently moving existing POS sales or deleting the XLS importer. Only owner/appropriate administrator may activate a bound store.

## Daily operations and next-morning briefing (future)
Use Europe/Dublin for Irish trading dates once confirmed. Do not send a clean/green end-of-day report for a dashboard-only date or source awaiting finance reconciliation. Include unresolved exception counts, money recovery status, missing journal coverage, historic correction flag and links to manager review.
Use per-restaurant/date/recipient unique delivery keys so reimports or retries do not duplicate notifications. **No automatic delivery is enabled in this branch.**

## Key acceptance tests before frontend release
1. Rudy's and Maximilian's 1 September 2026 real journal identity preview matches official Captiva order counts, returns correct native event identifiers without leaking customer/payment information.
2. Repeat the same signed payload: no duplicate event, note, receipt, recovery or sign-off.
3. Corrected journal loses a previously recorded refund: new daily briefing excludes it while immutable historical audit retains it.
4. Fully refunded payment never automatically subtracts a second time from Captiva dashboard gross.
5. Wrong restaurant user cannot view another site's exception note or verify payment; view-only user cannot see private review notes.
6. Two-person recovery approval; claims already recorded in POS excluded from provisional added recoveries.
7. Manager cannot sign off dashboard-only, superseded or unapproved journal, or source with unresolved exceptions / pending payment claims.
8. Gourmet Pizza Factory remains inactive until explicitly onboarded and Captiva's missing journal publishing is addressed.

Implementation is kept on `feature/captiva-secure-ingest` until approved; do not use this document to deploy live schema or switch Lovable integrations now.