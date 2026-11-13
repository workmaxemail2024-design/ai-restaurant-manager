import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createCaptivaHttpClient } from "../_shared/captivaTransport.ts";

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

          // Captiva Cloud Journal API (JSON) v1.2, pp. 3-6:
          // POST a JSON body with api_userid, api_pass, api_request.
          // The API account ID supplied as the UI's "API Key" is the api_userid
          // candidate; confirm this field in the Captiva developer Tools.
          // "get_api_stores" is read-only and returns the stores granted to the account.
          const requestPayload = {
            api_userid: String(api_key),
            api_pass: String(password),
            api_request: "get_api_stores",
            // Captiva Cloud Journal API v1.2 "get_api_stores" sample requests an
            // empty store array and returns all stores allowed for the API account.
            stores: [],
          };
          const proxyClient = createCaptivaHttpClient();
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 20000);
          let response: Response;
          let responseText: string;
          try {
            response = await fetch(captivaEndpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
              },
              body: JSON.stringify(requestPayload),
              signal: controller.signal,
              ...(proxyClient ? { client: proxyClient } : {}),
            });
            // Consume response before closing the proxy client.
            responseText = await response.text();
          } finally {
            clearTimeout(timeout);
            proxyClient?.close();
          }

          // Do not log request secrets or the raw response.
          let responseData: Record<string, unknown> | null = null;
          try {
            const parsed: unknown = JSON.parse(responseText);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              responseData = parsed as Record<string, unknown>;
            }
          } catch {
            // Unexpected non-JSON response is not proof of working API access.
          }

          if (!response.ok) {
            testResult = {
              success: false,
              error: `Captiva returned HTTP ${response.status}`,
            };
          } else if (!responseData) {
            testResult = {
              success: false,
              error: "Captiva did not return valid Journal API JSON.",
            };
          } else {
            const resultType = String(responseData.result ?? "").toLowerCase();
            const apiError = resultType === "error" || resultType === "fail" ||
              responseData.success === false || responseData.Success === false ||
              responseData.Error != null || responseData.ErrorMessage != null ||
              responseData.error != null || responseData.errorMessage != null;
            const resultCode = responseData.resultcode
              ? String(responseData.resultcode)
              : "";
            if (apiError) {
              const detail = responseData.resultdesc ?? responseData.ErrorMessage ??
                responseData.errorMessage ?? responseData.Error ?? responseData.error ??
                "Request rejected";
              testResult = {
                success: false,
                error: `Captiva API error${resultCode ? ` ${resultCode}` : ""}: ${String(detail)}`,
              };
            } else {
              const stores = Array.isArray(responseData.stores) ? responseData.stores : [];
              // Normalize leading zeros (some Captiva installations use
              // numeric store IDs, e.g. 2137 instead of "02137").
              const normalizeStore = (id: unknown) =>
                String(id ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "") || "0";
              const storeIds = stores.map((entry: unknown) => {
                if (!entry || typeof entry !== "object") return "";
                const item = entry as Record<string, unknown>;
                return String(item.storeid ?? item.id ?? "");
              }).filter(Boolean);
              const matched = storeIds.some(id =>
                normalizeStore(id) === normalizeStore(store_id)
              );
              if (matched) {
                testResult = {
                  success: true,
                  message: `Captiva Journals API authenticated; outlet ${store_id} is authorised. Sales retrieval has not yet been tested.`,
                };
              } else {
                testResult = {
                  success: false,
                  error: (() => {
                    // Captiva returns per-store failures in "storeerrors", even
                    // when the top-level API result is "success" (000000).
                    // Do not expose raw response/debug fields or credentials.
                    const field = responseData.storeerrors;
                    const records = Array.isArray(field)
                      ? field.slice(0, 4)
                      : field == null ? [] : [field];
                    const safe = (value: unknown): string => {
                      const raw = String(value ?? "");
                      return raw.replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/ig, "[redacted-id]")
                        .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/ig,"[redacted-email]")
                        .replace(/(api_?pass|password|secret|api_?key|api_?userid)[^,;\s]*/ig,"[redacted]")
                        .slice(0, 140);
                    };
                    const details = records.map((entry) => {
                      const fields = entry && typeof entry === "object" && !Array.isArray(entry)
                        ? entry as Record<string, unknown> : {};
                      const code = fields.resultcode ?? fields.errorcode ?? fields.code ?? fields.status ?? "";
                      const description = fields.info ?? fields.resultdesc ?? fields.errordesc ??
                        fields.error_message ?? fields.message ?? fields.error ?? fields.description ?? "";
                      if (Object.keys(fields).length === 0 && typeof entry === "string") return safe(entry);
                      const store = safe(fields.storeid ?? fields.id ?? "");
                      return `outlet: ${store || "unknown"}, code: ${safe(code) || "unknown"}, info: ${safe(description) || "not provided"}`;
                    });
                    const topDescription = safe(responseData.resultdesc);
                    const hints = /ip|whitelist|registered host|host not/i.test(JSON.stringify(field ?? ""))
                      ? " Possible IP access restriction."
                      : /access|authori[sz]|integrat|not enabled|permission/i.test(JSON.stringify(field ?? ""))
                        ? " Possible store permission restriction." : "";
                    return `Captiva reached (HTTP ${response.status}; ${String(responseData.result ?? "unspecified")}; code ${resultCode || "none"}), but outlet ${store_id} not returned. Stores: ${storeIds.length ? storeIds.slice(0,10).join(", ") : "none"}. Store errors: ${details.length ? details.join(" | ") : "empty"}. Top message: ${topDescription || "none"}.${hints}`;
                  })(),
                };
              }
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
