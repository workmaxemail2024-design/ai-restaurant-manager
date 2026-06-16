import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CaptivaSettings {
  base_url?: string;
  store_id?: string;
  api_key?: string;
  username?: string;
  password?: string;
}

interface SyncResult {
  success: boolean;
  sales_imported: number;
  line_items_imported: number;
  skipped_duplicates: number;
  failed_rows: number;
  errors: string[];
  applied?: {
    applied_count: number;
    total_revenue: number;
    line_items_unmapped: number;
  };
  error?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth: accept either a logged-in user JWT OR the service-role key
    // (the service-role path lets the nightly cron / captiva-schedule-sync call us safely)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    const isServiceRole = serviceRoleKey && token === serviceRoleKey;

    if (!isServiceRole) {
      const supabase = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
      if (claimsError || !claims?.claims) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const body = await req.json();
    const { integration_id, date_from, date_to, location_id, auto_apply } = body;

    if (!integration_id || !date_from || !date_to || !location_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required params: integration_id, date_from, date_to, location_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role for DB operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch integration details
    const { data: integration, error: intError } = await adminClient
      .from("pos_integrations")
      .select("*")
      .eq("id", integration_id)
      .single();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({ success: false, error: "Integration not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settings = integration.settings as CaptivaSettings;
    if (!settings?.base_url || !settings?.store_id || !settings?.username || !settings?.password) {
      return new Response(
        JSON.stringify({ success: false, error: "Integration missing required Captiva credentials" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = settings.api_key || integration.api_key;
    const result: SyncResult = {
      success: true,
      sales_imported: 0,
      line_items_imported: 0,
      skipped_duplicates: 0,
      failed_rows: 0,
      errors: [],
    };

    // Mark the attempt timestamp immediately so we can tell when the integration was last touched
    // (this is intentionally separate from last_successful_sync_at, which only advances on full success)
    await adminClient
      .from("pos_integrations")
      .update({ last_sync_attempt_at: new Date().toISOString() })
      .eq("id", integration_id);

    // Check if simulation mode
    const simulateMode = Deno.env.get("SIMULATE_CAPTIVA") === "true";

    let salesData: unknown[] = [];

    if (simulateMode) {
      // Generate mock data for testing
      console.log("Running in SIMULATE_CAPTIVA mode - generating mock data");
      const mockSales = [];
      const startDate = new Date(date_from);
      const endDate = new Date(date_to);
      
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const numSales = Math.floor(Math.random() * 10) + 5;
        for (let i = 0; i < numSales; i++) {
          mockSales.push({
            receipt_id: `SIM-${d.toISOString().split('T')[0]}-${i}`,
            sale_date: d.toISOString(),
            total: (Math.random() * 100 + 10).toFixed(2),
            items: [
              { name: `Item ${i + 1}`, qty: Math.floor(Math.random() * 3) + 1, price: (Math.random() * 20 + 5).toFixed(2) }
            ],
            operator: `OP${Math.floor(Math.random() * 5) + 1}`,
          });
        }
      }
      salesData = mockSales;
    } else {
      // Call Captiva API for sales data
      const salesUrl = `${settings.base_url.replace(/\/$/, "")}/outlet/${settings.store_id}/sales`;
      console.log("Fetching Captiva sales from:", salesUrl, "date range:", date_from, "to", date_to);

      try {
        const response = await fetch(salesUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "X-API-Key": apiKey,
            "X-Username": settings.username,
            "X-Password": settings.password,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from_date: date_from,
            to_date: date_to,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Captiva API error:", response.status, errorText);
          
          // Mark integration as failed (do NOT touch last_successful_sync_at)
          await adminClient
            .from("pos_integrations")
            .update({
              last_sync_status: "failed",
              last_sync_error: `Captiva API ${response.status}: ${errorText.substring(0, 300)}`,
            })
            .eq("id", integration_id);

          // Log the failed sync attempt
          await adminClient.from("pos_sync_logs").insert({
            location_id,
            restaurant_id: integration.restaurant_id,
            pos_provider: "captiva",
            event_type: "sync_failed",
            status: "error",
            message: `API returned ${response.status}`,
            details: { error: errorText.substring(0, 500), date_from, date_to, integration_id },
          });

          return new Response(
            JSON.stringify({ success: false, error: `Captiva API returned ${response.status}: ${errorText.substring(0, 200)}` }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const contentType = response.headers.get("Content-Type") || "";
        const rawBody = await response.text();

        // Handle XML or JSON response
        if (contentType.includes("xml")) {
          // Basic XML to JSON parsing for sales
          console.log("Parsing XML response from Captiva");
          // For now, extract basic sale records - in production, use proper XML parser
          const saleMatches = rawBody.matchAll(/<sale[^>]*>([\s\S]*?)<\/sale>/gi);
          for (const match of saleMatches) {
            const saleXml = match[1];
            const receiptId = saleXml.match(/<receipt_id>([^<]+)<\/receipt_id>/i)?.[1] || 
                              saleXml.match(/<id>([^<]+)<\/id>/i)?.[1];
            const total = saleXml.match(/<total>([^<]+)<\/total>/i)?.[1];
            const saleDate = saleXml.match(/<date>([^<]+)<\/date>/i)?.[1] ||
                             saleXml.match(/<sale_date>([^<]+)<\/sale_date>/i)?.[1];
            
            if (receiptId) {
              salesData.push({
                receipt_id: receiptId,
                sale_date: saleDate,
                total: parseFloat(total || "0"),
                raw_xml: saleXml,
              });
            }
          }
        } else {
          // Parse as JSON
          try {
            const jsonData = JSON.parse(rawBody);
            salesData = Array.isArray(jsonData) ? jsonData : (jsonData.sales || jsonData.data || []);
          } catch {
            console.error("Failed to parse Captiva response as JSON");
          }
        }
      } catch (err) {
        console.error("Captiva API fetch error:", err);

        await adminClient
          .from("pos_integrations")
          .update({
            last_sync_status: "failed",
            last_sync_error: `Network: ${err instanceof Error ? err.message : "Unknown"}`,
          })
          .eq("id", integration_id);

        await adminClient.from("pos_sync_logs").insert({
          location_id,
          restaurant_id: integration.restaurant_id,
          pos_provider: "captiva",
          event_type: "sync_failed",
          status: "error",
          message: err instanceof Error ? err.message : "Network error",
          details: { date_from, date_to, integration_id },
        });

        return new Response(
          JSON.stringify({ success: false, error: `Failed to reach Captiva: ${err instanceof Error ? err.message : "Network error"}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Processing ${salesData.length} sales records`);

    // Process and insert sales with idempotency via upsert
    for (const sale of salesData) {
      const saleRecord = sale as Record<string, unknown>;
      const externalSaleId = String(saleRecord.receipt_id || saleRecord.id || saleRecord.sale_id || `${Date.now()}-${Math.random()}`);
      const mappedSaleDate = saleRecord.sale_date ? String(saleRecord.sale_date).split("T")[0] : null;
      const mappedTotalPrice = typeof saleRecord.total === "number" ? saleRecord.total : parseFloat(String(saleRecord.total || 0));

      // Upsert the sale record (insert or update on conflict)
      // This ensures idempotency - reimporting the same date range updates existing records
      const { data: upserted, error: upsertError } = await adminClient
        .from("pos_sales_import")
        .upsert(
          {
            location_id,
            restaurant_id: integration.restaurant_id,
            pos_provider: "captiva",
            external_sale_id: externalSaleId,
            data: saleRecord,
            mapped_sale_date: mappedSaleDate,
            mapped_total_price: mappedTotalPrice,
            sync_status: "pending",
          },
          {
            onConflict: "restaurant_id,location_id,pos_provider,external_sale_id",
            ignoreDuplicates: false,
          }
        )
        .select("id")
        .single();

      if (upsertError) {
        // Check if it's a conflict/update (which means it was already there)
        if (upsertError.code === "23505" || upsertError.message?.includes("duplicate")) {
          result.skipped_duplicates++;
        } else {
          result.failed_rows++;
          const msg = `${upsertError.code || "err"}: ${upsertError.message || "unknown"}${upsertError.details ? ` (${upsertError.details})` : ""}${upsertError.hint ? ` hint=${upsertError.hint}` : ""}`;
          if (result.errors.length < 10) result.errors.push(msg);
          console.error("Failed to upsert sale:", upsertError);
        }
      } else {
        result.sales_imported++;
        // Count line items if present
        const items = saleRecord.items as unknown[] || [];
        result.line_items_imported += Array.isArray(items) ? items.length : 0;
      }
    }

    // Update integration last_sync_time
    await adminClient
      .from("pos_integrations")
      .update({ last_sync_time: new Date().toISOString() })
      .eq("id", integration_id);

    // Determine overall status: fail if every row errored, partial if some, success otherwise
    const overallStatus =
      result.failed_rows > 0 && result.sales_imported === 0
        ? "fail"
        : result.failed_rows > 0
        ? "partial"
        : "success";

    if (overallStatus !== "success") {
      result.success = result.sales_imported > 0; // partial is still "success-ish" but flagged
      if (overallStatus === "fail") {
        result.error = `All ${result.failed_rows} rows failed to import. First error: ${result.errors[0] ?? "unknown"}`;
      }
    }

    // Auto-apply staged imports into the sales table (default ON)
    // Skipped when the caller explicitly opts out (auto_apply === false) or when nothing was staged.
    const shouldAutoApply = auto_apply !== false && result.sales_imported > 0;
    if (shouldAutoApply) {
      try {
        const applyRes = await fetch(`${supabaseUrl}/functions/v1/pos-apply-import`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            integration_id,
            date_from,
            date_to,
            preview_only: false,
          }),
        });
        const applyJson = await applyRes.json();
        if (applyJson?.success) {
          result.applied = {
            applied_count: applyJson.applied_count ?? 0,
            total_revenue: applyJson.total_revenue ?? 0,
            line_items_unmapped: applyJson.line_items_unmapped ?? applyJson.skipped_unmapped ?? 0,
          };
        } else {
          if (result.errors.length < 10) {
            result.errors.push(`Auto-apply failed: ${applyJson?.error ?? "unknown"}`);
          }
        }
      } catch (applyErr) {
        const msg = applyErr instanceof Error ? applyErr.message : "Unknown auto-apply error";
        if (result.errors.length < 10) result.errors.push(`Auto-apply exception: ${msg}`);
        console.error("Auto-apply call failed:", applyErr);
      }
    }

    // Log the sync result with real visibility
    await adminClient.from("pos_sync_logs").insert({
      location_id,
      restaurant_id: integration.restaurant_id,
      pos_provider: "captiva",
      event_type: "sync_completed",
      status: overallStatus,
      message:
        `Fetched ${salesData.length} sales, staged ${result.sales_imported}` +
        (result.applied ? `, applied ${result.applied.applied_count} to dashboard` : "") +
        (result.skipped_duplicates ? `, ${result.skipped_duplicates} duplicates` : "") +
        (result.failed_rows ? `, ${result.failed_rows} failed` : ""),
      details: {
        date_from,
        date_to,
        fetched: salesData.length,
        sales_imported: result.sales_imported,
        line_items_imported: result.line_items_imported,
        skipped_duplicates: result.skipped_duplicates,
        failed_rows: result.failed_rows,
        errors: result.errors,
        applied: result.applied ?? null,
        simulation_mode: simulateMode,
      },
    });

    return new Response(
      JSON.stringify({ ...result, fetched: salesData.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("pos-sync-captiva error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
