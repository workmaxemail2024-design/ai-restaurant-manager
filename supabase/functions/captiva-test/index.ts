import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestBody = await req.json();
    const { base_url, api_key, api_secret, store_id, username, password, simulate } = requestBody;

    const globalSimulateMode = Deno.env.get("SIMULATE_CAPTIVA") === "true";
    const isSimulationMode = simulate === true || globalSimulateMode;

    console.log("Captiva test request:", { 
      base_url: base_url || "(empty)", 
      store_id: store_id || "(empty)", 
      hasApiKey: !!api_key,
      hasUsername: !!username,
      hasPassword: !!password,
      simulate: isSimulationMode 
    });

    // SIMULATION MODE
    if (isSimulationMode) {
      console.log("🎮 SIMULATION MODE - Returning simulated Captiva test response");
      return new Response(
        JSON.stringify(simulateCaptivaTestResponse()),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // LIVE MODE - Validate credentials
    if (!base_url || !store_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing base_url or store_id for live mode" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Testing LIVE Captiva connection to ${base_url} for store ${store_id}`);

    // Build auth header based on available credentials
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };

    if (api_key) {
      headers["X-API-Key"] = api_key;
    }
    if (username && password) {
      headers["Authorization"] = `Basic ${btoa(`${username}:${password}`)}`;
    } else if (api_key && api_secret) {
      headers["Authorization"] = `Basic ${btoa(`${api_key}:${api_secret}`)}`;
    }

    const testEndpoint = `${base_url.replace(/\/$/, "")}/outlet/${store_id}/status`;

    try {
      const response = await fetch(testEndpoint, {
        method: "GET",
        headers,
      });

      const responseText = await response.text();
      let responseData;
      
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText.substring(0, 500) };
      }

      if (response.ok) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Captiva connection successful",
            provider: "captiva",
            store_id,
            simulation: false,
            status_code: response.status,
            data: responseData,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Captiva API returned ${response.status}: ${response.statusText}`,
            status_code: response.status,
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
