import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pos-provider, x-location-id, x-webhook-signature",
};

// Verify webhook signature using HMAC-SHA256
async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) {
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload)
    );

    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    // Compare signatures (handle both with and without 'sha256=' prefix)
    const providedSig = signature.replace(/^sha256=/, "").toLowerCase();
    return expectedSignature.toLowerCase() === providedSig;
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get provider and location from headers
    const posProvider = req.headers.get("x-pos-provider");
    const locationId = req.headers.get("x-location-id");
    const webhookSignature = req.headers.get("x-webhook-signature") || 
                             req.headers.get("x-signature") ||
                             req.headers.get("x-hub-signature-256");

    // Read raw body for signature verification
    const rawBody = await req.text();
    let body: Record<string, unknown>;
    
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const provider = posProvider || body.pos_provider as string || body.provider as string;
    const location = locationId || body.location_id as string;

    if (!provider || !location) {
      return new Response(
        JSON.stringify({ error: "Missing pos_provider or location_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get webhook secret for this integration to verify signature
    const { data: integration, error: integrationError } = await supabase
      .from("pos_integrations")
      .select("api_secret, status")
      .eq("location_id", location)
      .eq("pos_provider", provider)
      .single();

    if (integrationError || !integration) {
      console.error("Integration lookup error:", integrationError);
      return new Response(
        JSON.stringify({ error: "Integration not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (integration.status !== "active") {
      return new Response(
        JSON.stringify({ error: "Integration is not active" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify webhook signature if secret is configured
    if (integration.api_secret) {
      const isValid = await verifyWebhookSignature(
        rawBody,
        webhookSignature || "",
        integration.api_secret
      );

      if (!isValid) {
        console.error("Invalid webhook signature for provider:", provider);
        
        // Log failed authentication attempt
        await supabase.from("pos_sync_logs").insert({
          location_id: location,
          pos_provider: provider,
          event_type: "webhook_auth_failed",
          message: "Invalid webhook signature",
          status: "fail",
          details: { timestamp: new Date().toISOString() },
        });

        return new Response(
          JSON.stringify({ error: "Invalid webhook signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Log warning that webhook secret is not configured
      console.warn(`Webhook secret not configured for ${provider} at location ${location}`);
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
    const eventType = body.type as string || body.event_type as string || body.webhook_type as string;

    if (eventType?.includes("sale") || eventType?.includes("order") || eventType?.includes("payment")) {
      // Process sales data
      const salesData = (body.data as Record<string, unknown>)?.sales || body.sales || body.orders || [body.data || body];
      
      // Call the sales import function internally with service role auth
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
      const clockData = (body.data as Record<string, unknown>)?.clock_events || body.clock_events || body.timecards || [body.data || body];
      
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
