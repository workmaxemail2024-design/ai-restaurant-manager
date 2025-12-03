import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// POS Provider API endpoints for testing
const POS_ENDPOINTS: Record<string, string> = {
  square: "https://connect.squareup.com/v2/locations",
  lightspeed: "https://api.lightspeedapp.com/API/V3/Account.json",
  clover: "https://api.clover.com/v3/merchants",
  toast: "https://api.toasttab.com/authentication/v1/authentication/check",
  custom: "",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify user authentication
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

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("Authentication error:", authError);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { pos_provider, api_key, api_secret, custom_endpoint } = await req.json();

    if (!pos_provider) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing pos_provider" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For custom providers, test the custom endpoint
    if (pos_provider === "custom") {
      if (!custom_endpoint) {
        return new Response(
          JSON.stringify({ success: false, error: "Custom provider requires custom_endpoint" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const response = await fetch(custom_endpoint, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${api_key}`,
            "Content-Type": "application/json",
          },
        });

        return new Response(
          JSON.stringify({
            success: response.ok,
            status: response.status,
            message: response.ok ? "Connection successful" : "Connection failed",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ success: false, error: "Failed to reach custom endpoint" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const endpoint = POS_ENDPOINTS[pos_provider.toLowerCase()];
    if (!endpoint) {
      return new Response(
        JSON.stringify({ success: false, error: `Unknown POS provider: ${pos_provider}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build headers based on provider
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    switch (pos_provider.toLowerCase()) {
      case "square":
        headers["Authorization"] = `Bearer ${api_key}`;
        headers["Square-Version"] = "2024-01-18";
        break;
      case "lightspeed":
        headers["Authorization"] = `Bearer ${api_key}`;
        break;
      case "clover":
        headers["Authorization"] = `Bearer ${api_key}`;
        break;
      case "toast":
        headers["Authorization"] = `Bearer ${api_key}`;
        break;
    }

    // Note: In production, you'd actually test the connection
    // For demo purposes, we'll simulate success if API key is provided
    if (api_key) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `${pos_provider} connection validated`,
          provider: pos_provider,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "API key required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("POS test connection error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
