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
      last_heartbeat: new Date().toISOString(),
      store_id: "sim-store",
    },
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("Authentication error:", authError);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestBody = await req.json();
    const { base_url, api_key, api_secret, store_id, simulate } = requestBody;

    // Check global simulation mode or per-request simulate flag
    const globalSimulateMode = Deno.env.get("SIMULATE_CAPTIVA") === "true";
    const isSimulationMode = simulate === true || globalSimulateMode;

    console.log("Captiva test request:", { 
      base_url: base_url || "(empty)", 
      store_id: store_id || "(empty)", 
      hasApiKey: !!api_key, 
      hasApiSecret: !!api_secret,
      simulate: isSimulationMode 
    });

    // ============ SIMULATION MODE ============
    if (isSimulationMode) {
      console.log("🎮 SIMULATION MODE - Returning simulated Captiva test response");
      return new Response(
        JSON.stringify(simulateCaptivaTestResponse()),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ REAL API MODE ============
    // Use defaults for missing credentials in simulation mode
    const effectiveBaseUrl = base_url || "simulated";
    const effectiveApiKey = api_key || "sim-key";
    const effectiveApiSecret = api_secret || "sim-secret";
    const effectiveStoreId = store_id || "sim-store";

    if (effectiveBaseUrl === "simulated" || !base_url) {
      console.log("No base_url provided, returning simulation response");
      return new Response(
        JSON.stringify(simulateCaptivaTestResponse()),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Testing Captiva connection to ${effectiveBaseUrl} for store ${effectiveStoreId}`);

    // Captiva typically uses Basic Auth with API key and secret
    const authString = btoa(`${effectiveApiKey}:${effectiveApiSecret}`);
    
    // Test endpoint - typically /api/v1/status or /api/v1/stores
    const testEndpoint = effectiveStoreId && effectiveStoreId !== "sim-store"
      ? `${effectiveBaseUrl.replace(/\/$/, "")}/api/v1/stores/${effectiveStoreId}`
      : `${effectiveBaseUrl.replace(/\/$/, "")}/api/v1/status`;

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
        
        responseData = { 
          status: successMatch ? successMatch[1] : "unknown", 
          raw: xmlText.substring(0, 200),
        };
      } else {
        responseData = await response.json().catch(() => ({}));
      }

      if (response.ok) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Captiva connection successful",
            provider: "captiva",
            store_id: effectiveStoreId,
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
          error: `Failed to connect to Captiva: ${fetchError instanceof Error ? fetchError.message : "Network error"}`,
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
