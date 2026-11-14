import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";
import { resolveCaller, unauthorized } from "../_shared/posAuth.ts";

// This function handles only human manager reviews and unverified recovery
// claims. It CANNOT import Captiva journals, verify payments, modify revenue,
// sign off a day or update any existing POS sales.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses = new Set(["reviewing", "resolved", "reopened"]);
const resolutions = new Set([
  "pending", "paid_in_pos", "paid_outside_pos_pending", "recovery_verified",
  "confirmed_unpaid", "legitimate_cancellation", "invalid_event",
]);
const methods = new Set(["cash", "card", "bank", "other"]);

type Json = Record<string, unknown>;

const answer = (payload: Json, status = 200): Response =>
  new Response(JSON.stringify(payload), { status, headers: cors });

const isObject = (v: unknown): v is Json =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && uuidRe.test(v);

/** Input amount may be string or number; validate as decimal with 2dp. */
const normalizeAmount = (amount: unknown): string | null => {
  if (typeof amount !== "string" && typeof amount !== "number") return null;
  const value = String(amount);
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value)) return null;
  const decimal = Number(value);
  if (!Number.isFinite(decimal) || decimal <= 0) return null;
  return value;
};

/** Check CURRENT user's active role for the TARGET restaurant, not default role. */
async function authorizeManager(
  client: ReturnType<typeof createClient>,
  userId: string,
  restaurantId: string,
  locationId: string,
): Promise<boolean> {
  const { data: memberships, error: memberError } = await client
    .from("user_restaurants")
    .select("role_id, is_active")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1);
  if (memberError || !memberships?.length || !memberships[0]?.role_id) return false;

  const { data: role, error: roleError } = await client
    .from("roles")
    .select("restaurant_id, permissions")
    .eq("id", memberships[0].role_id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (roleError || !role) return false;
  const permissions = isObject(role.permissions) ? role.permissions : {};
  const posPerms = isObject(permissions.pos) ? permissions.pos : {};
  const fullAccess = permissions.full_access === true;
  const mayEdit = fullAccess || posPerms.edit === true || posPerms.admin === true;
  if (!mayEdit) return false;

  const { data: location, error: locationError } = await client
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (locationError || !location) return false;

  if (fullAccess) return true;
  const { data: assignment, error: assignmentError } = await client
    .from("user_location_access")
    .select("id")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .eq("location_id", locationId)
    .maybeSingle();

  return !assignmentError && !!assignment;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return answer({ success: false, error: "Method not allowed" }, 405);

  try {
    const caller = await resolveCaller(req);
    // Service-role and cron are intentionally denied for manager activity.
    // The actor must be a verified human user JWT.
    if (caller.kind !== "user") {
      return unauthorized("An authenticated manager is required", cors);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return answer({ success: false, error: "Invalid JSON" }, 400);
    }
    if (!isObject(body) || !isUuid(body.event_id) || !isUuid(body.request_id)) {
      return answer({ success: false, error: "event_id and request_id UUIDs are required" }, 400);
    }

    const action = body.action;
    if (action !== "review" && action !== "claim_recovery") {
      return answer({ success: false, error: "Unsupported action" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const roleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !roleKey) {
      return answer({ success: false, error: "Server configuration unavailable" }, 503);
    }
    const admin = createClient(url, roleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Source event determines restaurant and location. Never trust request-body
    // tenant fields or client-set manager identity.
    const { data: event, error: eventError } = await admin
      .from("pos_exception_events")
      .select("id,restaurant_id,location_id")
      .eq("id", body.event_id)
      .maybeSingle();
    if (eventError) {
      console.error("Exception lookup failed:", eventError.code);
      return answer({ success: false, error: "Could not load exception" }, 500);
    }
    if (!event) return answer({ success: false, error: "Exception not found" }, 404);

    const allowed = await authorizeManager(
      admin, caller.userId, event.restaurant_id, event.location_id,
    );
    if (!allowed) {
      return unauthorized("Not authorised to review this location's POS events", cors, 403);
    }

    if (action === "review") {
      const status = body.status;
      const resolution = body.resolution;
      const note = body.note;
      if (typeof status !== "string" || !statuses.has(status)
        || typeof resolution !== "string" || !resolutions.has(resolution)
        || typeof note !== "string" || note.length > 4000
        || (status === "resolved" && (resolution === "pending" || note.trim().length < 5))) {
        return answer({ success: false, error: "Invalid review status, resolution or note" }, 400);
      }
      // Claiming 'recovery_verified' requires a separately verified payment;
      // this API must never allow a note to falsely assert financial approval.
      if (resolution === "recovery_verified") {
        return answer({ success: false, error: "Recovery verification is not enabled" }, 409);
      }

      const { data, error } = await admin.rpc("pos_record_exception_review", {
        p_event_id: event.id,
        p_actor_id: caller.userId,
        p_request_id: body.request_id,
        p_status: status,
        p_resolution: resolution,
        p_note: note.trim(),
      });
      if (error) {
        console.error("Exception review RPC failed:", error.code);
        return answer({ success: false, error: "Could not save review" }, 500);
      }
      return answer({ success: true, review_id: data, revenue_changed: false });
    }

    const amount = normalizeAmount(body.amount);
    const method = body.method;
    const reference = body.payment_reference;
    if (!amount || typeof method !== "string" || !methods.has(method)
      || typeof reference !== "string" || reference.trim().length < 4
      || reference.trim().length > 160) {
      return answer({ success: false, error: "Invalid recovery claim" }, 400);
    }
    const { data, error } = await admin.rpc("pos_claim_recovered_payment", {
      p_event_id: event.id,
      p_actor_id: caller.userId,
      p_request_id: body.request_id,
      p_amount: amount,
      p_method: method,
      p_reference: reference.trim(),
    });
    if (error) {
      console.error("Recovery claim RPC failed:", error.code);
      return answer({ success: false, error: "Could not save recovery claim" }, 500);
    }
    return answer({
      success: true,
      recovery_claim_id: data,
      recovery_status: "pending_verification",
      revenue_changed: false,
    });
  } catch (error) {
    console.error("pos-exception-review unexpected error:", error instanceof Error ? error.name : "unknown");
    return answer({ success: false, error: "Internal server error" }, 500);
  }
});
