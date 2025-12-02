import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pos-provider, x-location-id",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get provider from header or body
    const posProvider = req.headers.get("x-pos-provider");
    const locationId = req.headers.get("x-location-id");
    const body = await req.json();

    const provider = posProvider || body.pos_provider || body.provider;
    const location = locationId || body.location_id;

    if (!provider || !location) {
      return new Response(
        JSON.stringify({ error: "Missing pos_provider or location_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the webhook
    await supabase.from("pos_sync_logs").insert({
      location_id: location,
      pos_provider: provider,
      event_type: "webhook_received",
      message: `Webhook received from ${provider}`,
      status: "success",
      details: { event_type: body.type || body.event_type, timestamp: new Date().toISOString() },
    });

    // Route based on event type
    const eventType = body.type || body.event_type || body.webhook_type;

    if (eventType?.includes("sale") || eventType?.includes("order") || eventType?.includes("payment")) {
      // Process sales data
      const salesData = body.data?.sales || body.sales || body.orders || [body.data || body];
      
      // Call the sales import function internally
      const salesUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pos-import-sales`;
      await fetch(salesUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          location_id: location,
          pos_provider: provider,
          sales: Array.isArray(salesData) ? salesData : [salesData],
        }),
      });
    }

    if (eventType?.includes("employee") || eventType?.includes("clock") || eventType?.includes("timecard")) {
      // Process staff clock events
      const clockData = body.data?.clock_events || body.clock_events || body.timecards || [body.data || body];
      
      const staffUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pos-import-staff`;
      await fetch(staffUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          location_id: location,
          pos_provider: provider,
          clock_events: Array.isArray(clockData) ? clockData : [clockData],
        }),
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: "Webhook processed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("POS webhook handler error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
