import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";
import { resolveCaller, unauthorized } from "../_shared/posAuth.ts";

// Authenticated management-facing read-only API for the future Lovable UI.
// It does NOT generate/send notifications, modify revenue, or approve payments.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const answer = (value: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: cors });

// Work in integer cents for management reports; do not add floating-point
// journal payments or double-count POS-recorded recoveries.
function eurosToCents(value: unknown): number | null {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) return null;
  const cents = Number(match[1]) * 100
    + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

function centsToEuros(cents: number): string {
  return (cents / 100).toFixed(2);
}

async function managerCanRead(
  admin: SupabaseClient<any, "public">,
  userId: string,
  restaurantId: string,
  locationId: string,
): Promise<boolean> {
  const { data: rows, error } = await admin
    .from("user_restaurants")
    .select("role_id")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .limit(1);
  const memberships = rows as unknown as Array<{ role_id: string | null }> | null;
  if (error || !memberships?.[0]?.role_id) return false;

  const { data, error: roleError } = await admin
    .from("roles")
    .select("permissions")
    .eq("id", memberships[0].role_id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const role = data as unknown as { permissions?: Record<string, unknown> } | null;
  const perms = role?.permissions;
  if (roleError || !perms) return false;

  const pos = perms.pos as Record<string, unknown> | undefined;
  const full = perms.full_access === true;
  // Exception review notes are privileged; this endpoint is for managers.
  const allowed = full || pos?.edit === true || pos?.admin === true;
  if (!allowed) return false;
  if (full) return true;

  const { data: assignment, error: accessError } = await admin
    .from("user_location_access")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("location_id", locationId)
    .eq("user_id", userId)
    .maybeSingle();
  return !accessError && !!assignment;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return answer({ success: false, error: "POST only" }, 405);

  try {
    const caller = await resolveCaller(req);
    if (caller.kind !== "user") return unauthorized("Manager login required", cors);
    let body: unknown;
    try { body = await req.json(); } catch {
      return answer({ success: false, error: "Invalid JSON" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return answer({ success: false, error: "Invalid request" }, 400);
    }
    const args = body as Record<string, unknown>;
    if (typeof args.location_id !== "string" || !uuid.test(args.location_id)
      || typeof args.date !== "string" || !dateRe.test(args.date)
      || !Number.isFinite(Date.parse(args.date + "T00:00:00Z"))) {
      return answer({ success: false, error: "location_id UUID and ISO date are required" }, 400);
    }
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !serviceKey) return answer({ success: false, error: "Server unavailable" }, 503);
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: loc, error: locationError } = await admin
      .from("locations")
      .select("id,restaurant_id,name,timezone")
      .eq("id", args.location_id)
      .maybeSingle();
    if (locationError) return answer({ success: false, error: "Location unavailable" }, 500);
    if (!loc?.restaurant_id) return answer({ success: false, error: "Location is not assigned to a restaurant" }, 409);
    if (!await managerCanRead(admin, caller.userId, loc.restaurant_id, loc.id)) {
      return unauthorized("No management access to this restaurant/location", cors, 403);
    }

    const { data: snapshots, error: snapshotErr } = await admin
      .from("pos_captiva_daily_sources")
      .select("id,store_id,trading_date,official_gross,official_net,official_vat,official_orders,journal_standard_payments,journal_refund_payments,journal_other_payments,journal_payment_records,journal_coverage,reconciliation_state,observed_at")
      .eq("restaurant_id", loc.restaurant_id)
      .eq("location_id", loc.id)
      .eq("trading_date", args.date)
      .order("observed_at", { ascending: false })
      .limit(1);
    if (snapshotErr) return answer({ success: false, error: "Daily source unavailable" }, 503);

    const source = snapshots?.[0] ?? null;
    if (!source) {
      return answer({
        success: true, location_id: loc.id, location_name: loc.name,
        trading_date: args.date, coverage: "not_imported",
        official_financials: null, exception_counts: null,
        exceptions: null, pending_recoveries: null,
        signed_off: false,
      });
    }
    const sourceData = {
      gross: source.official_gross,
      net: source.official_net,
      vat: source.official_vat,
      orders: source.official_orders,
      note: "Captiva reported values. Not modified by manager review notes.",
    };
    const paymentDiagnostics = source.journal_coverage === "complete" ? {
      journal_standard_payments: source.journal_standard_payments,
      journal_refund_payments: source.journal_refund_payments,
      journal_other_payments: source.journal_other_payments,
      journal_payment_records: source.journal_payment_records,
      warning: "Journal payment status amounts are audit evidence, not extra revenue deductions.",
    } : null;
    if (source.journal_coverage !== "complete") {
      return answer({
        success: true, location_id: loc.id, location_name: loc.name,
        trading_date: args.date, coverage: source.journal_coverage,
        reconciliation_state: source.reconciliation_state,
        official_financials: sourceData,
        payment_diagnostics: null,
        exception_counts: null, exceptions: null,
        pending_recoveries: null, signed_off: false,
        warning: "Journal audit unavailable; zero refunds or voids cannot be assumed.",
      });
    }

    // Only display events belonging to the selected latest source version.
    // Keep older source versions append-only for forensic audit without
    // displaying a removed refund as though it remains in the latest journal.
    const { data: sourceLinks, error: linksError } = await admin
      .from("pos_captiva_event_sources")
      .select("event_id")
      .eq("source_id", source.id)
      .eq("restaurant_id", loc.restaurant_id)
      .eq("location_id", loc.id)
      .limit(2001);
    if (linksError || (sourceLinks?.length ?? 0) > 2000) {
      return answer({ success: false, error: "Journal event links require review" }, 409);
    }
    const eventIds = (sourceLinks ?? []).map((item) => item.event_id);
    let events: Array<Record<string, unknown>> = [];
    if (eventIds.length) {
      const { data: rows, error: eventError } = await admin
        .from("pos_exception_events")
        .select("id,event_type,event_code,original_amount,removed_item_count,source_operator,source_date_text,source_time_text,created_at")
        .eq("restaurant_id", loc.restaurant_id)
        .eq("location_id", loc.id)
        .eq("trading_date", args.date)
        .in("id", eventIds)
        .order("created_at", { ascending: true })
        .limit(2001);
      if (eventError || (rows?.length ?? 0) !== eventIds.length) {
        return answer({ success: false, error: "Journal audit event lookup incomplete" }, 409);
      }
      events = rows ?? [];
    }
    let reviewStates: Array<Record<string, unknown>> = [];
    let recoveryStates: Array<Record<string, unknown>> = [];
    if (eventIds.length) {
      const [revs, recovs] = await Promise.all([
        admin.from("pos_exception_reviews")
          .select("event_id,review_status,resolution,reviewed_at,last_note")
          .in("event_id", eventIds).limit(2001),
        admin.from("pos_recovery_claims")
          .select("event_id,claimed_amount,status,already_in_pos")
          .in("event_id", eventIds).limit(2001),
      ]);
      if (revs.error || recovs.error || (revs.data?.length ?? 0) > 2000
          || (recovs.data?.length ?? 0) > 2000) {
        return answer({ success: false, error: "Audit review limit requires pagination" }, 409);
      }
      reviewStates = revs.data ?? [];
      recoveryStates = recovs.data ?? [];
    }
    const reviewById = new Map(reviewStates.map((x) => [x.event_id, x]));
    const counts: Record<string, number> = {};
    const details = (events ?? []).map((e) => {
      const eventType = String(e.event_type ?? "unclassified");
      counts[eventType] = (counts[eventType] ?? 0) + 1;
      const review = reviewById.get(e.id);
      return {
        event_id: e.id,
        event_type: e.event_type,
        event_code: e.event_code,
        original_amount: e.original_amount,
        removed_item_count: e.removed_item_count,
        source_operator: e.source_operator,
        source_date_text: e.source_date_text,
        source_time_text: e.source_time_text,
        review_status: review?.review_status ?? "open",
        resolution: review?.resolution ?? "pending",
        manager_note: review?.last_note ?? null,
        reviewed_at: review?.reviewed_at ?? null,
      };
    });
    const pendingRecoveries = recoveryStates
      .filter((x) => x.status === "pending_verification")
      .map((x) => ({ event_id: x.event_id, amount: x.claimed_amount,
        status: "pending_verification", revenue_added: false }));
    const verifiedExternalClaims = recoveryStates
      .filter((x) => x.status === "verified" && x.already_in_pos === false);
    const verifiedCents = verifiedExternalClaims.reduce((total, claim) => {
      const amount = eurosToCents(claim.claimed_amount);
      if (amount === null) throw new Error("Invalid verified recovery amount");
      return total + amount;
    }, 0);
    const officialGrossCents = eurosToCents(source.official_gross);
    if (officialGrossCents === null || !Number.isSafeInteger(verifiedCents)) {
      return answer({ success: false, error: "Financial amount out of range" }, 409);
    }
    const provisionalAdjustedGrossCents = officialGrossCents + verifiedCents;
    if (!Number.isSafeInteger(provisionalAdjustedGrossCents)) {
      return answer({ success: false, error: "Adjusted amount out of range" }, 409);
    }
    const recoveriesAlreadyInPos = recoveryStates
      .filter((x) => x.status === "verified" && x.already_in_pos === true).length;
    const { data: signoffs, error: signoffErr } = await admin
      .from("pos_exception_daily_signoffs")
      .select("signed_at,signed_by")
      .eq("restaurant_id", loc.restaurant_id)
      .eq("location_id", loc.id)
      .eq("trading_date", args.date)
      .limit(1);
    if (signoffErr) return answer({ success: false, error: "Sign-off status unavailable" }, 503);

    return answer({
      success: true,
      location_id: loc.id,
      location_name: loc.name,
      trading_date: args.date,
      coverage: source.journal_coverage,
      reconciliation_state: source.reconciliation_state,
      official_financials: sourceData,
      payment_diagnostics: paymentDiagnostics,
      exception_counts: counts,
      exceptions: details,
      unresolved_count: details.filter((x) => x.review_status !== "resolved").length,
      pending_recoveries: pendingRecoveries,
      verified_external_recoveries: {
        amount: centsToEuros(verifiedCents),
        claim_count: verifiedExternalClaims.length,
        excluded_already_in_pos_claim_count: recoveriesAlreadyInPos,
        revenue_ledger_modified: false,
      },
      provisional_gross_plus_verified_external_recoveries:
        centsToEuros(provisionalAdjustedGrossCents),
      signed_off: !!signoffs?.length,
      signed_at: signoffs?.[0]?.signed_at ?? null,
      caveat: "Official Captiva gross is unchanged. Provisional adjusted gross adds only independently verified claims expressly marked NOT in the POS; no accounting ledger entry has been posted.",
    });
  } catch (err) {
    console.error("Captiva briefing failure:", err instanceof Error ? err.name : "unknown");
    return answer({ success: false, error: "Internal report error" }, 500);
  }
});
