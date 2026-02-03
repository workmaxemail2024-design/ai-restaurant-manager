import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApplyResult {
  success: boolean;
  sales_to_apply: number;       // Number of unique sales (receipts) to apply
  applied_count: number;        // Sales successfully applied
  line_items_mapped: number;    // Line items that are mapped
  line_items_unmapped: number;  // Line items that are unmapped (skipped)
  skipped_existing: number;     // Already applied
  total_revenue: number;
  error?: string;
  // Legacy fields for backward compatibility
  skipped_unmapped: number;
}

interface ImportRecord {
  id: string;
  external_sale_id: string | null;
  location_id: string;
  restaurant_id: string | null;
  pos_provider: string;
  data: Record<string, unknown>;
  mapped_dish_id: string | null;
  mapped_total_price: number | null;
  mapped_quantity: number | null;
  mapped_sale_date: string | null;
  sync_status: string;
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
      .select("*, locations(restaurant_id)")
      .eq("id", integration_id)
      .single();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({ success: false, error: "Integration not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get restaurant_id from integration or from the linked location
    const restaurantId = integration.restaurant_id || 
      (integration.locations as { restaurant_id: string } | null)?.restaurant_id;

    if (!restaurantId) {
      console.error("No restaurant_id found for integration or its location");
      return new Response(
        JSON.stringify({ success: false, error: "Integration is not linked to a restaurant. Please check location setup." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch pending imports for the date range
    // Use sync_status NOT in ['applied'] to include both 'pending' and 'unmapped'
    const { data: imports, error: importError } = await adminClient
      .from("pos_sales_import")
      .select("*")
      .eq("location_id", integration.location_id)
      .eq("pos_provider", integration.pos_provider)
      .gte("mapped_sale_date", date_from)
      .lte("mapped_sale_date", date_to)
      .neq("sync_status", "applied");

    if (importError) {
      console.error("Error fetching imports:", importError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch imports" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const importRecords = (imports || []) as ImportRecord[];

    // Group imports by external_sale_id (each represents a receipt/transaction)
    // Each import row in the current system represents one sale/receipt with total
    // If external_sale_id is null, treat each row as its own sale
    const salesMap = new Map<string, ImportRecord[]>();
    
    for (const imp of importRecords) {
      const saleKey = imp.external_sale_id || imp.id; // Use id as fallback
      if (!salesMap.has(saleKey)) {
        salesMap.set(saleKey, []);
      }
      salesMap.get(saleKey)!.push(imp);
    }

    const result: ApplyResult = {
      success: true,
      sales_to_apply: salesMap.size,
      applied_count: 0,
      line_items_mapped: 0,
      line_items_unmapped: 0,
      skipped_existing: 0,
      total_revenue: 0,
      skipped_unmapped: 0, // For backward compatibility
    };

    // Calculate preview stats
    for (const [saleKey, saleImports] of salesMap) {
      // Get the sale total from the first import (they should all have the same total for the sale)
      const saleTotal = Number(saleImports[0]?.mapped_total_price || 0);
      result.total_revenue += saleTotal;
      
      // Count mapped vs unmapped line items
      for (const imp of saleImports) {
        if (imp.mapped_dish_id) {
          result.line_items_mapped++;
        } else {
          result.line_items_unmapped++;
        }
      }
    }

    // Backward compat: skipped_unmapped = line_items_unmapped for old UI
    result.skipped_unmapped = result.line_items_unmapped;

    // If preview_only, return counts without applying
    if (preview_only) {
      console.log(`Preview: ${result.sales_to_apply} sales to apply, ${formatCurrency(result.total_revenue)} revenue`);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${result.sales_to_apply} sales for application`);

    // Check existing sales to prevent duplicates
    const externalSaleIds = Array.from(salesMap.keys()).filter(id => id !== null);
    
    // We need to track which sales were already applied
    // Check the sales table or rely on sync_status being 'applied'
    const alreadyAppliedImports = importRecords.filter(imp => imp.sync_status === "applied");
    const alreadyAppliedSaleIds = new Set(alreadyAppliedImports.map(imp => imp.external_sale_id || imp.id));

    // Process each sale (receipt)
    for (const [saleKey, saleImports] of salesMap) {
      // Skip if already applied
      if (alreadyAppliedSaleIds.has(saleKey)) {
        result.skipped_existing++;
        continue;
      }

      // Get sale metadata from first import
      const primaryImport = saleImports[0];
      const saleDate = primaryImport.mapped_sale_date;
      const saleTotal = Number(primaryImport.mapped_total_price || 0);
      
      // If no mapped_dish_id, we need to create a "POS Import" placeholder dish or skip line items
      // For now, we'll insert the sale with the total even if no individual items are mapped
      // This ensures revenue shows on dashboard even without complete mappings
      
      // Check if there's at least one mapped item for detailed insertion
      const mappedItems = saleImports.filter(imp => imp.mapped_dish_id);
      
      if (mappedItems.length > 0) {
        // Insert individual line items as sales
        for (const imp of mappedItems) {
          const quantity = imp.mapped_quantity || 1;
          const itemPrice = Number(imp.mapped_total_price || 0);
          
          const { error: insertError } = await adminClient
            .from("sales")
            .insert({
              location_id: integration.location_id,
              restaurant_id: restaurantId,
              dish_id: imp.mapped_dish_id,
              quantity: quantity,
              total_price: itemPrice,
              sale_date: saleDate,
            });

          if (insertError) {
            console.error("Failed to insert mapped sale item:", insertError);
          }
        }
      } else {
        // No mapped items - we still want to record the sale total for revenue tracking
        // We need a "fallback" dish for unmapped sales
        // First, check if we have an "Unmapped POS Sale" dish for this restaurant
        let fallbackDishId: string | null = null;
        
        const { data: fallbackDish } = await adminClient
          .from("dishes")
          .select("id")
          .eq("restaurant_id", restaurantId)
          .eq("name", "Unmapped POS Sale")
          .single();
        
        if (fallbackDish) {
          fallbackDishId = fallbackDish.id;
        } else {
          // Create the fallback dish
          const { data: newDish, error: dishError } = await adminClient
            .from("dishes")
            .insert({
              restaurant_id: restaurantId,
              name: "Unmapped POS Sale",
              selling_price: 0,
              category: "POS Imports",
            })
            .select("id")
            .single();
          
          if (!dishError && newDish) {
            fallbackDishId = newDish.id;
            console.log(`Created fallback dish for unmapped sales: ${fallbackDishId}`);
          } else {
            console.error("Failed to create fallback dish:", dishError);
          }
        }
        
        // Insert sale with fallback dish (or skip if we couldn't create one)
        if (fallbackDishId) {
          const { error: insertError } = await adminClient
            .from("sales")
            .insert({
              location_id: integration.location_id,
              restaurant_id: restaurantId,
              dish_id: fallbackDishId,
              quantity: 1,
              total_price: saleTotal,
              sale_date: saleDate,
            });

          if (insertError) {
            console.error("Failed to insert unmapped sale:", insertError);
          }
        }
      }

      // Update all import records for this sale to 'applied'
      const importIds = saleImports.map(imp => imp.id);
      await adminClient
        .from("pos_sales_import")
        .update({ sync_status: "applied" })
        .in("id", importIds);

      result.applied_count++;
    }

    // Recalculate total_revenue based on actual applied sales
    result.total_revenue = 0;
    for (const [saleKey, saleImports] of salesMap) {
      if (!alreadyAppliedSaleIds.has(saleKey)) {
        result.total_revenue += Number(saleImports[0]?.mapped_total_price || 0);
      }
    }

    // Log the apply result
    await adminClient.from("pos_sync_logs").insert({
      location_id: integration.location_id,
      restaurant_id: restaurantId,
      pos_provider: integration.pos_provider,
      event_type: "apply_completed",
      status: "success",
      message: `Applied ${result.applied_count} sales (${formatCurrency(result.total_revenue)}), ${result.line_items_unmapped} line items unmapped`,
      details: {
        date_from,
        date_to,
        sales_to_apply: result.sales_to_apply,
        applied_count: result.applied_count,
        line_items_mapped: result.line_items_mapped,
        line_items_unmapped: result.line_items_unmapped,
        skipped_existing: result.skipped_existing,
        total_revenue: result.total_revenue,
      },
    });

    console.log(`Apply complete: ${result.applied_count} sales, ${formatCurrency(result.total_revenue)}`);

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
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format(amount);
}
