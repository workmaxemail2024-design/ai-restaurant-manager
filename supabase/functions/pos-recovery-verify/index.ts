import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";
import { resolveCaller, unauthorized } from "../_shared/posAuth.ts";

// A separate finance approver checks a recovery claim against external
// cash/card evidence. Approval NEVER writes into Captiva sales or XLS imports.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Content-Type": "application/json",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const response = (o: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: cors });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return response({ success: false, error: "POST required" }, 405);
  try {
    const caller = await resolveCaller(req);
    if (caller.kind !== "user") return unauthorized("Finance manager authentication required", cors);
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
      return response({ success: false, error: "Invalid JSON" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)
      || typeof body.claim_id !== "string" || !uuid.test(body.claim_id)
      || typeof body.request_id !== "string" || !uuid.test(body.request_id)
      || (body.decision !== "verified" && body.decision !== "rejected")
      || (body.decision === "verified" && typeof body.already_in_pos !== "boolean")
      || typeof body.note !== "string"
      || body.note.trim().length < 10 || body.note.length > 4000) {
      return response({ success: false, error: "Invalid verification request" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !key) return response({ success: false, error: "Service unavailable" }, 503);
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: claim, error: claimError } = await admin
      .from("pos_recovery_claims")
      .select("id,restaurant_id,location_id,claimed_by,status")
      .eq("id", body.claim_id)
      .maybeSingle();
    if (claimError) return response({ success: false, error: "Recovery claim unavailable" }, 503);
    if (!claim) return response({ success: false, error: "Recovery claim not found" }, 404);
    if (claim.claimed_by === caller.userId) {
      return response({ success: false, error: "A different finance approver is required" }, 403);
    }

    const { data: membershipRows, error: memberErr } = await admin
      .from("user_restaurants")
      .select("role_id")
      .eq("restaurant_id", claim.restaurant_id)
      .eq("user_id", caller.userId)
      .eq("is_active", true)
      .limit(1);
    const memberships = membershipRows as unknown as Array<{ role_id: string | null }> | null;
    if (memberErr || !memberships?.[0]?.role_id) {
      return unauthorized("No active finance membership for this restaurant", cors, 403);
    }
    const { data: roleRow, error: roleErr } = await admin
      .from("roles")
      .select("permissions")
      .eq("restaurant_id", claim.restaurant_id)
      .eq("id", memberships[0].role_id)
      .maybeSingle();
    const role = roleRow as unknown as { permissions: Record<string, unknown> } | null;
    const permissions = role?.permissions ?? {};
    const finance = typeof permissions.finance === "object" && permissions.finance !== null
      ? permissions.finance as Record<string, unknown> : {};
    if (roleErr || !(permissions.full_access === true || finance.admin === true)) {
      return unauthorized("Finance admin permission required to verify recovered payments", cors, 403);
    }
    if (permissions.full_access !== true) {
      const { data: location, error: locationErr } = await admin
        .from("user_location_access")
        .select("id")
        .eq("user_id", caller.userId)
        .eq("restaurant_id", claim.restaurant_id)
        .eq("location_id", claim.location_id)
        .maybeSingle();
      if (locationErr || !location) {
        return unauthorized("Location finance access required", cors, 403);
      }
    }
    const { data, error } = await admin.rpc("pos_verify_recovery_claim", {
      p_claim_id: claim.id,
      p_reviewer_id: caller.userId,
      p_request_id: body.request_id,
      p_decision: body.decision,
      p_already_in_pos: body.decision === "verified" ? body.already_in_pos : null,
      p_note: body.note.trim(),
    });
    if (error) {
      console.error("Recovery verification RPC:", error.code);
      return response({ success: false, error: "Verification rejected or previously decided" }, 409);
    }
    return response({
      success: true, result: data, original_pos_sales_changed: false,
    });
  } catch (e) {
    console.error("Recovery approval handler:", e instanceof Error ? e.name : "unknown");
    return response({ success: false, error: "Internal verification error" }, 500);
  }
});
