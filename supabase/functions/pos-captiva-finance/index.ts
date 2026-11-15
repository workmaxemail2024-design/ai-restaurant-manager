import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";
import { resolveCaller, unauthorized } from "../_shared/posAuth.ts";

// Independent, authenticated financial source approval and daily close.
// Does NOT update existing sales, Captiva dashboard, refunds or XLS imports.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Content-Type": "application/json",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const respond = (v: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: cors });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return respond({ success: false, error: "POST only" }, 405);

  try {
    const caller = await resolveCaller(req);
    if (caller.kind !== "user") return unauthorized("Finance manager login required", cors);

    let body: unknown;
    try { body = await req.json(); } catch {
      return respond({ success: false, error: "Invalid JSON" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return respond({ success: false, error: "Invalid request" }, 400);
    }
    const args = body as Record<string, unknown>;
    if (!["approve_source", "signoff_day"].includes(String(args.action))
      || typeof args.source_id !== "string" || !uuid.test(args.source_id)
      || typeof args.request_id !== "string" || !uuid.test(args.request_id)
      || typeof args.note !== "string" || args.note.length > 4000
      || args.note.trim().length < (args.action === "approve_source" ? 15 : 10)
      || (args.action === "approve_source"
          && (typeof args.evidence_reference !== "string"
              || args.evidence_reference.trim().length < 5
              || args.evidence_reference.trim().length > 160))) {
      return respond({ success: false, error: "Invalid finance approval or sign-off fields" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !key) return respond({ success: false, error: "Service not configured" }, 503);
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: source, error: sourceError } = await admin
      .from("pos_captiva_daily_sources")
      .select("id,restaurant_id,location_id,trading_date,journal_coverage")
      .eq("id", args.source_id)
      .maybeSingle();
    if (sourceError) return respond({ success: false, error: "Source unavailable" }, 503);
    if (!source) return respond({ success: false, error: "Source not found" }, 404);

    const { data: memberRows, error: memberError } = await admin
      .from("user_restaurants")
      .select("role_id")
      .eq("user_id", caller.userId)
      .eq("restaurant_id", source.restaurant_id)
      .eq("is_active", true)
      .limit(1);
    const members = memberRows as unknown as Array<{ role_id: string | null }> | null;
    if (memberError || !members?.[0]?.role_id) {
      return unauthorized("Finance membership required for this restaurant", cors, 403);
    }
    const { data: roleRow, error: roleError } = await admin
      .from("roles")
      .select("permissions")
      .eq("id", members[0].role_id)
      .eq("restaurant_id", source.restaurant_id)
      .maybeSingle();
    const role = roleRow as unknown as { permissions?: Record<string, unknown> } | null;
    const perms = role?.permissions ?? {};
    const finance = perms.finance && typeof perms.finance === "object"
      ? perms.finance as Record<string, unknown> : {};
    if (roleError || !(perms.full_access === true || finance.admin === true)) {
      return unauthorized("Finance administrator permission required", cors, 403);
    }
    if (perms.full_access !== true) {
      const { data: assignment, error: assignmentError } = await admin
        .from("user_location_access")
        .select("id")
        .eq("restaurant_id", source.restaurant_id)
        .eq("location_id", source.location_id)
        .eq("user_id", caller.userId)
        .maybeSingle();
      if (assignmentError || !assignment) {
        return unauthorized("No finance approval permission for this location", cors, 403);
      }
    }

    if (args.action === "approve_source") {
      const { data, error } = await admin.rpc("pos_approve_captiva_daily_source", {
        p_source_id: source.id,
        p_approver_id: caller.userId,
        p_request_id: args.request_id,
        p_note: args.note.trim(),
        p_evidence_reference: (args.evidence_reference as string).trim(),
      });
      if (error) {
        console.error("Captiva source finance approval RPC:", error.code);
        return respond({ success: false, error: "Source not eligible or already approved" }, 409);
      }
      return respond({
        success: true,
        finance_approval_id: data,
        status: "independently_approved",
        revenue_changed: false,
      });
    }

    const { data, error } = await admin.rpc("pos_signoff_captiva_day", {
      p_source_id: source.id,
      p_signer_id: caller.userId,
      p_request_id: args.request_id,
      p_note: args.note.trim(),
    });
    if (error) {
      console.error("Captiva day signoff RPC:", error.code);
      return respond({ success: false, error: "Day not eligible for closeout" }, 409);
    }
    return respond({
      success: true,
      daily_signoff_id: data,
      status: "signed_off",
      revenue_changed: false,
    });
  } catch (error) {
    console.error("Captiva finance endpoint:", error instanceof Error ? error.name : "unknown");
    return respond({ success: false, error: "Internal finance review error" }, 500);
  }
});
