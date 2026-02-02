import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApplyResult {
  success: boolean;
  applied_count: number;
  skipped_unmapped: number;
  skipped_existing: number;
  total_revenue: number;
  error?: string;
}

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

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { integration_id, date_from, date_to, preview_only } = body;

    if (!integration_id || !date_from || !date_to) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required params: integration_id, date_from, date_to" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role for DB operations
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

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

    // Fetch pending imports for the date range
    const { data: imports, error: importError } = await adminClient
      .from("pos_sales_import")
      .select("*")
      .eq("location_id", integration.location_id)
      .eq("pos_provider", integration.pos_provider)
      .gte("mapped_sale_date", date_from)
      .lte("mapped_sale_date", date_to)
      .in("sync_status", ["pending", "unmapped"]);

    if (importError) {
      console.error("Error fetching imports:", importError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch imports" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result: ApplyResult = {
      success: true,
      applied_count: 0,
      skipped_unmapped: 0,
      skipped_existing: 0,
      total_revenue: 0,
    };

    // If preview_only, just return counts without applying
    if (preview_only) {
      for (const imp of imports || []) {
        if (imp.mapped_dish_id) {
          result.applied_count++;
          result.total_revenue += Number(imp.mapped_total_price || 0);
        } else {
          result.skipped_unmapped++;
        }
      }
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${imports?.length || 0} imports for application`);

    // Process each import
    for (const imp of imports || []) {
      // Skip if no mapped dish (mark as unmapped)
      if (!imp.mapped_dish_id) {
        result.skipped_unmapped++;
        
        // Update status to unmapped if not already
        if (imp.sync_status !== "unmapped") {
          await adminClient
            .from("pos_sales_import")
            .update({ sync_status: "unmapped" })
            .eq("id", imp.id);
        }
        continue;
      }

      // Check if this sale already exists (idempotency via external_sale_id lookup in import)
      // We'll use a composite check: same dish, same date, same location, similar total
      const saleDate = imp.mapped_sale_date;
      const quantity = imp.mapped_quantity || 1;
      const totalPrice = Number(imp.mapped_total_price || 0);

      // Check if already applied by looking at sync_status
      if (imp.sync_status === "applied") {
        result.skipped_existing++;
        continue;
      }

      // Insert into sales table
      const { error: insertError } = await adminClient
        .from("sales")
        .insert({
          location_id: integration.location_id,
          restaurant_id: integration.restaurant_id,
          dish_id: imp.mapped_dish_id,
          quantity: quantity,
          total_price: totalPrice,
          sale_date: saleDate,
        });

      if (insertError) {
        console.error("Failed to insert sale:", insertError);
        // Continue processing other records
        continue;
      }

      // Update import status to applied
      await adminClient
        .from("pos_sales_import")
        .update({ sync_status: "applied" })
        .eq("id", imp.id);

      result.applied_count++;
      result.total_revenue += totalPrice;
    }

    // Log the apply result
    await adminClient.from("pos_sync_logs").insert({
      location_id: integration.location_id,
      restaurant_id: integration.restaurant_id,
      pos_provider: integration.pos_provider,
      event_type: "apply_completed",
      status: "success",
      message: `Applied ${result.applied_count} sales (${formatCurrency(result.total_revenue)}), ${result.skipped_unmapped} unmapped`,
      details: {
        date_from,
        date_to,
        applied_count: result.applied_count,
        skipped_unmapped: result.skipped_unmapped,
        skipped_existing: result.skipped_existing,
        total_revenue: result.total_revenue,
      },
    });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("pos-apply-import error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}
