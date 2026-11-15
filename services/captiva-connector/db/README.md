# RestaurantAI exception review backend — isolated proposal

**Status: NOT deployed to production Supabase or Lovable. No sales data altered.**

The branch contains a proposed PostgreSQL schema, a manager-authenticated Edge Function, synthetic SQL test fixtures and GitHub CI. It depends on the original read-only Captiva connector in PR #2.

## Files and testing

- EXCEPTION_REVIEW_SCHEMA_PROPOSAL.sql — proposed tables, tenant/location RLS and server-only atomic RPCs; not yet a generated Supabase migration.
- tests/schema_stub.sql and tests/exception_schema_smoke.sql — entirely synthetic identities and event data for isolated PostgreSQL CI.
- supabase/functions/pos-exception-review/index.ts — manager HTTP handler, not deployed.
- supabase/config.toml — requires valid user JWT.
- Automated GitHub Actions test SQL in temporary PostgreSQL, and typecheck the Edge Function. No real POS data or secrets enter CI.

## How it works

Original Captiva dashboard snapshots and POS exception events are immutable evidence. The manager review status may change, but every change is recorded as an append-only audit entry. Users must be authenticated and hold POS edit permissions for the particular restaurant and location. Staff with POS view-only rights cannot see private manager notes or payment-recovery details.

An unverified recovery claim cannot change reported revenue. A later, separate financial verification mechanism must confirm that the payment exists and was not already accounted for in Captiva. No verified-payment state is enabled yet. The endpoint always returns revenue_changed: false.

A user action has a unique request_id. The UI should generate it once and reuse it when retrying the same action to prevent duplicate notes/claims.

## Future frontend request examples

Review event:

    {
      "action": "review",
      "event_id": "<UUID of exception event>",
      "request_id": "<retry-stable UUID>",
      "status": "reviewing",
      "resolution": "pending",
      "note": "Awaiting confirmation from duty manager"
    }

Resolve as unpaid:

    {
      "action": "review",
      "event_id": "<UUID of exception event>",
      "request_id": "<new UUID>",
      "status": "resolved",
      "resolution": "confirmed_unpaid",
      "note": "Confirmed that the payment was not collected"
    }

Claim payment recovered (pending verification only):

    {
      "action": "claim_recovery",
      "event_id": "<UUID of exception event>",
      "request_id": "<new UUID>",
      "amount": "45.00",
      "method": "cash",
      "payment_reference": "CASH-SHEET-REFERENCE"
    }

All actions are restricted to signed-in managers. Neither a review nor a claimed recovery changes the financial ledger.

## Safe rollout gates

1. Generate a proper migration with the Supabase CLI after code review; this SQL file is a proposal and not an applied migration.
2. Test on a separate database first. Creating a Supabase branch can incur a cost and requires user agreement; until then, use isolated GitHub PostgreSQL CI.
3. Verify stable journal/order/history event identifiers for idempotent imports; XML array positions alone are not stable IDs.
4. Build secure Oracle outbound ingestion and reconcile combo, void and refund accounting against official Captiva daily gross/net/VAT.
5. Keep XLS imports and existing sales untouched until an explicit, validated cutover plan is approved.
6. Add Lovable manager UI, evidence attachment handling, verified recovered-payment approvals and day sign-off.
7. Schedule morning alerts only after the production import and reconciliation are proven.

## Known Captiva data coverage

- Rudy's on 2026-09-01: 28 orders, gross EUR 2398.45; detailed journal available; raw product sum EUR 3837.95 is NOT revenue; refund EUR 420.60 recorded, with outstanding reconciliation.
- Maximilian's: gross EUR 2473.70 and standard payments match, detailed journal available.
- Gourmet Pizza Factory: gross EUR 2396.81 on 2026-09-01 but detailed journal missing; most recent listed journal is 2025-10-06. See issue #3. Audit counts must remain unknown on missing-journal days.
