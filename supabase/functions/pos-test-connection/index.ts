import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const body = await req.json();
    const { pos_provider, integration_id } = body;

    if (!pos_provider) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing pos_provider" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use admin client for updating integration record
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let testResult: { success: boolean; message?: string; error?: string };

    // Handle Captiva POS specifically using Captiva Cloud Journals API v1.2
    if (pos_provider === "captiva") {
      const { base_url, store_id, api_key, username, password } = body;

      if (!base_url || !store_id || !api_key || !username || !password) {
        testResult = { success: false, error: "Missing required Captiva credentials (base_url, store_id, api_key, username, password)" };
      } else {
        try {
          // Build Captiva Cloud API endpoint - append /CaptivaCloudAPIRequest.ashx
          const cleanBaseUrl = base_url.replace(/\/$/, "").replace(/\/CaptivaCloudAPIRequest\.ashx$/i, "");
          const captivaEndpoint = `${cleanBaseUrl}/CaptivaCloudAPIRequest.ashx`;
          console.log("Testing Captiva Cloud connection to:", captivaEndpoint);

          // Use the lightest possible request - GetOutletDetails or similar
          // Per Captiva Cloud Journals API v1.2, we use a minimal request to validate credentials
          const requestPayload = {
            APIKey: api_key,
            UserName: username,
            Password: password,
            OutletCode: store_id,
            // Request outlet validation - lightest operation
            RequestType: "GetOutletDetails"
          };

          console.log("Captiva request payload (sanitized):", {
            ...requestPayload,
            APIKey: "***",
            Password: "***"
          });

          const response = await fetch(captivaEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify(requestPayload),
          });

          const responseText = await response.text();
          console.log("Captiva response status:", response.status);
          console.log("Captiva response body (first 500 chars):", responseText.substring(0, 500));

          // Try to parse response as JSON
          let responseData: Record<string, unknown> | null = null;
          try {
            responseData = JSON.parse(responseText);
          } catch {
            // Response might not be JSON
            console.log("Response is not JSON, treating as text");
          }

          // Check for Captiva-specific error responses
          if (responseData) {
            // Captiva API typically returns Success: true/false or ErrorMessage
            const success = responseData.Success === true || 
                           responseData.success === true ||
                           responseData.Status === "OK" ||
                           responseData.status === "OK" ||
                           (response.ok && !responseData.ErrorMessage && !responseData.errorMessage);

            const errorMessage = responseData.ErrorMessage || 
                                responseData.errorMessage || 
                                responseData.Error || 
                                responseData.error ||
                                responseData.Message ||
                                responseData.message;

            if (success) {
              testResult = { 
                success: true, 
                message: `Captiva Cloud connection validated for outlet ${store_id}` 
              };
            } else if (errorMessage) {
              testResult = { 
                success: false, 
                error: `Captiva error: ${String(errorMessage)}` 
              };
            } else if (response.ok) {
              // Response OK but no explicit success flag - treat as success
              testResult = { 
                success: true, 
                message: "Captiva Cloud connection validated" 
              };
            } else {
              testResult = { 
                success: false, 
                error: `Captiva returned HTTP ${response.status}` 
              };
            }
          } else {
            // Non-JSON response
            if (response.ok) {
              testResult = { 
                success: true, 
                message: "Captiva Cloud connection validated" 
              };
            } else {
              testResult = { 
                success: false, 
                error: `Captiva returned HTTP ${response.status}: ${responseText.substring(0, 200)}` 
              };
            }
          }
        } catch (err) {
          console.error("Captiva connection error:", err);
          const errorMsg = err instanceof Error ? err.message : "Network error";
          testResult = { 
            success: false, 
            error: `Failed to reach Captiva Cloud: ${errorMsg}` 
          };
        }
      }
    } else {
      // Handle other POS providers (existing logic)
      const { api_key, api_secret, custom_endpoint } = body;

      if (pos_provider === "custom") {
        if (!custom_endpoint) {
          testResult = { success: false, error: "Custom provider requires custom_endpoint" };
        } else {
          try {
            const response = await fetch(custom_endpoint, {
              method: "GET",
              headers: {
                "Authorization": `Bearer ${api_key}`,
                "Content-Type": "application/json",
              },
            });
            testResult = {
              success: response.ok,
              message: response.ok ? "Connection successful" : "Connection failed",
              error: response.ok ? undefined : `Status: ${response.status}`,
            };
          } catch (err) {
            testResult = { success: false, error: "Failed to reach custom endpoint" };
          }
        }
      } else if (api_key) {
        // For demo purposes with other providers, simulate success if API key is provided
        testResult = {
          success: true,
          message: `${pos_provider} connection validated`,
        };
      } else {
        testResult = { success: false, error: "API key required" };
      }
    }

    // Update integration record with test results if integration_id is provided
    if (integration_id) {
      const updateData = {
        last_tested_at: new Date().toISOString(),
        last_test_status: testResult.success ? "success" : "failed",
        last_test_error: testResult.success ? null : testResult.error,
      };

      const { error: updateError } = await adminClient
        .from("pos_integrations")
        .update(updateData)
        .eq("id", integration_id);

      if (updateError) {
        console.error("Failed to update integration test status:", updateError);
      }
    }

    return new Response(
      JSON.stringify(testResult),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("POS test connection error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
