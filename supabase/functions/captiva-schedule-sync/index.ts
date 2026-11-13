// Automated Captiva imports are deliberately paused while the on-demand API
// workflow is validated. This scheduled endpoint NEVER stages or applies sales.
// It may be replaced only after IP-whitelisting, product mapping, reconciliation,
// and an explicit production rollout decision.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { resolveCaller, isInternal, unauthorized } from "../_shared/posAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const caller = await resolveCaller(req);
  if (!isInternal(caller)) {
    return unauthorized("Only scheduled internal callers can invoke this function", corsHeaders, 403);
  }
  return new Response(JSON.stringify({
    success: true,
    mode: "disabled",
    sales_staged: 0,
    sales_applied: 0,
    message: "Automated Captiva sync is paused. Use the supervised read-only date-range preview.",
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
