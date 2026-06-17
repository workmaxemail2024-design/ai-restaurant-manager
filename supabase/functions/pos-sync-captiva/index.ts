import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CaptivaSettings {
  base_url?: string;
  store_id?: string; // numeric outlet/store code, e.g. "02137"
  api_key?: string;
  username?: string;
  password?: string;
  user_id?: string; // numeric Captiva User ID (e.g. "2" for "Max Gerhardt 2")
  journals_service_id?: string; // UUID shown on AP/Journals popup (optional)
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
      // Call Captiva Cloud API dispatcher (.ashx) for sales data.
      // Safe Base URL normalization:
      //   - Trim whitespace and trailing slashes
      //   - If the saved value already ends in /CaptivaCloudAPIRequest.ashx (any case,
      //     optional trailing slash, optional query string), use it as-is.
      //   - Otherwise append /CaptivaCloudAPIRequest.ashx exactly once.
      const savedBaseUrl = (settings.base_url ?? "").trim();
      const trimmedBaseUrl = savedBaseUrl.replace(/\/+$/, "");
      const alreadyHasDispatcher = /\/CaptivaCloudAPIRequest\.ashx(\/|\?|$)/i.test(trimmedBaseUrl);
      const captivaEndpoint = alreadyHasDispatcher
        ? trimmedBaseUrl
        : `${trimmedBaseUrl}/CaptivaCloudAPIRequest.ashx`;

      // Try multiple RequestType names since Captiva exposes both sales/journal endpoints.
      // We attempt them in order until one returns rows or a clearly recognized response.
      const requestTypes = ["GetSales", "GetJournals", "GetProductSales", "GetSalesJournal"];

      const attemptDebug: Array<Record<string, unknown>> = [];
      let lastRawSample = "";
      let lastStatus = 0;
      let lastRequestType = "";

      for (const rt of requestTypes) {
        const requestPayload: Record<string, unknown> = {
          APIKey: apiKey,
          UserName: settings.username,
          Password: settings.password,
          OutletCode: settings.store_id,
          UserID: settings.user_id ?? "",
          RequestType: rt,
          FromDate: date_from,
          ToDate: date_to,
        };
        if (settings.journals_service_id) {
          requestPayload.ServiceID = settings.journals_service_id;
        }

        console.log(`Captiva fetch: ${captivaEndpoint} RequestType=${rt} OutletCode=${settings.store_id} UserID=${settings.user_id ?? "(none)"} ${date_from} -> ${date_to}`);

        // Sanitized payload (excludes APIKey/Password) for debug logging.
        const sanitizedPayload = {
          UserName: settings.username,
          OutletCode: settings.store_id,
          UserID: settings.user_id ?? "",
          ServiceID: settings.journals_service_id ?? null,
          RequestType: rt,
          FromDate: date_from,
          ToDate: date_to,
        };

        let attemptStatus = 0;
        let attemptRaw = "";
        let attemptRowCount = 0;
        let attemptError: string | null = null;

        try {
          const response = await fetch(captivaEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(requestPayload),
          });
          attemptStatus = response.status;
          lastStatus = response.status;
          lastRequestType = rt;
          const rawBody = await response.text();
          attemptRaw = rawBody.substring(0, 2000);
          lastRawSample = rawBody.substring(0, 1000);

          if (!response.ok) {
            console.log(`RequestType ${rt} returned HTTP ${response.status}, trying next.`);
            attemptError = `HTTP ${response.status}`;
            attemptDebug.push({ request_type: rt, sanitized_payload: sanitizedPayload, http_status: attemptStatus, parsed_row_count: 0, error: attemptError, raw_first_2000: attemptRaw });
            continue;
          }

          // Parse response: prefer JSON, fall back to XML scraping.
          let parsedRows: unknown[] = [];
          let parsedJson: Record<string, unknown> | null = null;
          try {
            parsedJson = JSON.parse(rawBody);
          } catch {
            parsedJson = null;
          }

          if (parsedJson) {
            const errMsg = parsedJson.ErrorMessage || parsedJson.errorMessage || parsedJson.Error || (parsedJson.result === "Error" ? parsedJson.resultdesc : null);
            if (errMsg && !parsedJson.Sales && !parsedJson.Data) {
              console.log(`RequestType ${rt} returned error: ${String(errMsg)}`);
              attemptError = String(errMsg);
              attemptDebug.push({ request_type: rt, sanitized_payload: sanitizedPayload, http_status: attemptStatus, parsed_row_count: 0, error: attemptError, raw_first_2000: attemptRaw });
              continue;
            }
            const candidate =
              (Array.isArray(parsedJson) && parsedJson) ||
              parsedJson.Sales || parsedJson.sales ||
              parsedJson.Journals || parsedJson.journals ||
              parsedJson.Data || parsedJson.data ||
              parsedJson.Results || parsedJson.results ||
              [];
            parsedRows = Array.isArray(candidate) ? candidate : [];
          } else if (rawBody.includes("<")) {
            const matches = rawBody.matchAll(/<(?:sale|journal|transaction)[^>]*>([\s\S]*?)<\/(?:sale|journal|transaction)>/gi);
            for (const m of matches) {
              const xml = m[1];
              const id = xml.match(/<(?:receipt_id|id|ReceiptNumber|TransactionID)>([^<]+)<\//i)?.[1];
              const total = xml.match(/<(?:total|GrossTotal|NetTotal|Amount)>([^<]+)<\//i)?.[1];
              const date = xml.match(/<(?:date|sale_date|TransactionDate|DateTime)>([^<]+)<\//i)?.[1];
              if (id) parsedRows.push({ receipt_id: id, sale_date: date, total: parseFloat(total ?? "0"), raw_xml: xml });
            }
          }

          attemptRowCount = parsedRows.length;
          attemptDebug.push({ request_type: rt, sanitized_payload: sanitizedPayload, http_status: attemptStatus, parsed_row_count: attemptRowCount, error: null, raw_first_2000: attemptRaw });

          if (parsedRows.length > 0) {
            salesData = parsedRows;
            console.log(`RequestType ${rt} returned ${parsedRows.length} rows`);
            break;
          }
          console.log(`RequestType ${rt} returned 0 rows, trying next.`);
        } catch (err) {
          attemptError = err instanceof Error ? err.message : String(err);
          console.error(`RequestType ${rt} fetch error:`, err);
          attemptDebug.push({ request_type: rt, sanitized_payload: sanitizedPayload, http_status: attemptStatus, parsed_row_count: 0, error: attemptError, raw_first_2000: attemptRaw });
        }
      }

      if (salesData.length === 0) {
        // Log a diagnostic so the user can see what the dispatcher returned for the last attempt.
        await adminClient.from("pos_sync_logs").insert({
          location_id,
          restaurant_id: integration.restaurant_id,
          pos_provider: "captiva",
          event_type: "sync_debug",
          status: "warning",
          message: `Captiva dispatcher returned 0 rows for ${date_from}..${date_to}`,
          details: {
            integration_id,
            date_from,
            date_to,
            endpoint: captivaEndpoint,
            outlet_code: settings.store_id,
            user_id: settings.user_id ?? null,
            last_request_type: lastRequestType,
            last_http_status: lastStatus,
            raw_sample: lastRawSample,
          },
        });
      }
    }

    console.log(`Processing ${salesData.length} sales records`);

    // Normalize raw Captiva rows into a consistent shape that captures item-level fields
    // (product ID/PLU, name, department, qty, gross, net, VAT, discounts) where present.
    const normalizeItems = (raw: Record<string, unknown>): Array<Record<string, unknown>> => {
      const itemSrc =
        (raw.Items as unknown[]) || (raw.items as unknown[]) ||
        (raw.LineItems as unknown[]) || (raw.lineItems as unknown[]) ||
        (raw.Products as unknown[]) || (raw.products as unknown[]) ||
        (raw.Lines as unknown[]) || (raw.lines as unknown[]) || [];
      if (!Array.isArray(itemSrc)) return [];
      return itemSrc.map((it) => {
        const i = it as Record<string, unknown>;
        return {
          product_id: i.ProductID ?? i.product_id ?? i.PLU ?? i.plu ?? i.ID ?? i.id ?? null,
          name: i.Name ?? i.name ?? i.ProductName ?? i.product_name ?? null,
          department: i.Department ?? i.department ?? i.DepartmentName ?? null,
          quantity: Number(i.Qty ?? i.qty ?? i.Quantity ?? i.quantity ?? 0) || 0,
          gross_sales: Number(i.GrossSales ?? i.gross_sales ?? i.Gross ?? i.AllSales ?? i.Sales ?? i.sales ?? i.Total ?? 0) || 0,
          net_sales: Number(i.NetSales ?? i.net_sales ?? i.Net ?? 0) || 0,
          vat: Number(i.VAT ?? i.vat ?? i.Tax ?? i.tax ?? 0) || 0,
          discounts: Number(i.Discounts ?? i.discounts ?? i.Discount ?? i.discount ?? 0) || 0,
          unit_price: Number(i.UnitPrice ?? i.unit_price ?? i.Price ?? i.price ?? 0) || 0,
          raw: i,
        };
      });
    };

    // Log a raw-parsed sample of the first sale (with normalized items) BEFORE applying to dashboard,
    // so the user can verify field mapping is correct in Sync Logs.
    if (salesData.length > 0) {
      const sample = salesData[0] as Record<string, unknown>;
      await adminClient.from("pos_sync_logs").insert({
        location_id,
        restaurant_id: integration.restaurant_id,
        pos_provider: "captiva",
        event_type: "sync_raw_sample",
        status: "info",
        message: `Raw parsed sample: 1 of ${salesData.length} sales (pre-apply)`,
        details: {
          integration_id,
          date_from,
          date_to,
          total_fetched: salesData.length,
          sample_raw: sample,
          sample_normalized_items: normalizeItems(sample),
        },
      });
    }

    // Process and insert sales with idempotency via upsert
    for (const sale of salesData) {
      const saleRecord = sale as Record<string, unknown>;
      const externalSaleId = String(
        saleRecord.receipt_id ?? saleRecord.ReceiptNumber ?? saleRecord.TransactionID ??
        saleRecord.id ?? saleRecord.ID ?? saleRecord.sale_id ?? `${Date.now()}-${Math.random()}`
      );
      const rawDate = saleRecord.sale_date ?? saleRecord.TransactionDate ?? saleRecord.DateTime ?? saleRecord.Date ?? null;
      const mappedSaleDate = rawDate ? String(rawDate).split("T")[0] : null;
      const rawTotal = saleRecord.total ?? saleRecord.GrossTotal ?? saleRecord.NetTotal ?? saleRecord.Amount ?? 0;
      const mappedTotalPrice = typeof rawTotal === "number" ? rawTotal : parseFloat(String(rawTotal || 0));
      // Enrich the stored payload with normalized item lines so downstream apply/mapping can use them.
      const enrichedRecord = { ...saleRecord, _normalized_items: normalizeItems(saleRecord) };

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
            data: enrichedRecord,
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
        // Count normalized line items
        result.line_items_imported += enrichedRecord._normalized_items.length;
      }
    }

    // Determine overall status: fail if every row errored, partial if some, success otherwise
    // Special case: zero fetched + zero failed = success (nothing to import for that range)
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

    // Status-aware checkpoint update:
    //  - Always record the attempt status + error text.
    //  - Only advance last_successful_sync_at (and legacy last_sync_time) on a fully successful sync.
    //    Partial/failed syncs intentionally leave the "good" checkpoint untouched so a retry can
    //    cover the same range again.
    const integrationUpdate: Record<string, unknown> = {
      last_sync_status: overallStatus,
      last_sync_error: overallStatus === "success" ? null : (result.errors[0] ?? result.error ?? null),
    };
    if (overallStatus === "success") {
      const nowIso = new Date().toISOString();
      integrationUpdate.last_successful_sync_at = nowIso;
      integrationUpdate.last_sync_time = nowIso;
    }
    await adminClient
      .from("pos_integrations")
      .update(integrationUpdate)
      .eq("id", integration_id);

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
        integration_id,
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
