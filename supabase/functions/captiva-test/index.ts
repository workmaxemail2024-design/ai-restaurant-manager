import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============ SIMULATION RESPONSE ============
function simulateCaptivaTestResponse() {
  return {
    success: true,
    message: "[SIMULATION] Captiva connection test successful",
    provider: "captiva",
    simulation: true,
    data: {
      status: "connected",
      store_name: "Simulated Store",
      api_version: "v1.0-simulated",
      capabilities: ["orders", "attendance", "inventory"],
      last_heartbeat: new Date().toISOString()
    }
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("Authentication error:", authError);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { base_url, api_key, api_secret, store_id, simulate } = await req.json();

    // Check global simulation mode or per-request simulate flag
    const globalSimulateMode = Deno.env.get("SIMULATE_CAPTIVA") === "true";
    const isSimulationMode = simulate === true || globalSimulateMode;

    // ============ SIMULATION MODE ============
    if (isSimulationMode) {
      console.log("🎮 SIMULATION MODE - Returning simulated Captiva test response");
      return new Response(
        JSON.stringify(simulateCaptivaTestResponse()),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ REAL API MODE ============
    if (!base_url || !api_key || !api_secret) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required credentials (base_url, api_key, api_secret)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Testing Captiva connection to ${base_url} for store ${store_id || 'default'}`);

    // Captiva typically uses Basic Auth with API key and secret
    const authString = btoa(`${api_key}:${api_secret}`);
    
    // Test endpoint - typically /api/v1/status or /api/v1/stores
    const testEndpoint = store_id 
      ? `${base_url.replace(/\/$/, '')}/api/v1/stores/${store_id}`
      : `${base_url.replace(/\/$/, '')}/api/v1/status`;

    try {
      const response = await fetch(testEndpoint, {
        method: "GET",
        headers: {
          "Authorization": `Basic ${authString}`,
          "Content-Type": "application/json",
          "Accept": "application/json, application/xml",
        },
      });

      const contentType = response.headers.get("content-type") || "";
      let responseData;
      
      if (contentType.includes("xml")) {
        const xmlText = await response.text();
        // Basic XML parsing for status check
        const successMatch = xmlText.match(/<status>(\w+)<\/status>/i);
        const errorMatch = xmlText.match(/<error>([^<]+)<\/error>/i);
        
        if (errorMatch) {
          return new Response(
            JSON.stringify({ success: false, error: errorMatch[1] }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        responseData = { status: successMatch ? successMatch[1] : "unknown", raw: xmlText.substring(0, 200) };
      } else {
        responseData = await response.json().catch(() => ({}));
      }

      if (response.ok) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Captiva connection successful",
            provider: "captiva",
            store_id: store_id || "default",
            simulation: false,
            data: responseData,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Captiva API returned ${response.status}: ${response.statusText}`,
            details: responseData,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (fetchError) {
      console.error("Captiva fetch error:", fetchError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to connect to Captiva: ${fetchError instanceof Error ? fetchError.message : "Network error"}` 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Captiva test error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
