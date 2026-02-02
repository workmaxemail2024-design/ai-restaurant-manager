import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { format, subDays } from "https://esm.sh/date-fns@3.6.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  
  if (!serviceRoleKey) {
    console.error("No service role key found");
    return new Response(
      JSON.stringify({ success: false, error: "Server configuration error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Check global simulation mode
  const globalSimulateMode = Deno.env.get("SIMULATE_CAPTIVA") === "true";

  try {
    console.log(`=== SCHEDULED CAPTIVA SYNC START (simulation_mode: ${globalSimulateMode}) ===`);

    // Get all active Captiva integrations with auto_sync_daily enabled
    const { data: integrations, error: intError } = await adminClient
      .from("pos_integrations")
      .select("id, location_id, restaurant_id, settings")
      .eq("pos_provider", "captiva")
      .eq("status", "active");

    if (intError) {
      console.error("Error fetching integrations:", intError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch integrations" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter to only those with auto_sync_daily enabled
    const autoSyncIntegrations = integrations?.filter(int => {
      const settings = (int.settings || {}) as Record<string, unknown>;
      return settings.auto_sync_daily === true;
    }) || [];

    if (autoSyncIntegrations.length === 0) {
      console.log("No Captiva integrations with auto_sync_daily enabled");
      return new Response(
        JSON.stringify({ success: true, message: "No integrations with auto sync enabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${autoSyncIntegrations.length} integrations with auto_sync_daily enabled`);

    // Calculate yesterday's date range
    const yesterday = subDays(new Date(), 1);
    const dateFrom = format(yesterday, "yyyy-MM-dd");
    const dateTo = format(yesterday, "yyyy-MM-dd");

    const results: Array<{ 
      integration_id: string; 
      success: boolean; 
      message: string; 
      simulation: boolean;
      sync_stats?: {
        sales_imported: number;
        line_items_imported: number;
        skipped_duplicates: number;
      };
      apply_stats?: {
        applied_count: number;
        skipped_unmapped: number;
        total_revenue: number;
      };
    }> = [];

    for (const integration of autoSyncIntegrations) {
      try {
        const settings = (integration.settings || {}) as Record<string, unknown>;
        const integrationSimulate = settings.simulate === true || settings.simulate === "true";
        const shouldSimulate = globalSimulateMode || integrationSimulate;

        console.log(`Processing integration ${integration.id} for location ${integration.location_id} (simulation: ${shouldSimulate})`);

        // Step 1: Sync from Captiva
        console.log(`  Step 1: Syncing from Captiva for ${dateFrom}...`);
        const syncResponse = await fetch(`${supabaseUrl}/functions/v1/pos-sync-captiva`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ 
            integration_id: integration.id,
            location_id: integration.location_id,
            date_from: dateFrom,
            date_to: dateTo,
          }),
        });

        const syncResult = await syncResponse.json();

        if (!syncResult.success) {
          console.error(`  ❌ Sync failed for integration ${integration.id}:`, syncResult.error);
          results.push({
            integration_id: integration.id,
            success: false,
            message: `Sync failed: ${syncResult.error}`,
            simulation: shouldSimulate,
          });
          continue;
        }

        console.log(`  ✅ Sync complete: ${syncResult.sales_imported} sales, ${syncResult.line_items_imported} items`);

        // Step 2: Apply to dashboard
        console.log(`  Step 2: Applying to dashboard...`);
        const applyResponse = await fetch(`${supabaseUrl}/functions/v1/pos-apply-import`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ 
            integration_id: integration.id,
            date_from: dateFrom,
            date_to: dateTo,
            preview_only: false,
          }),
        });

        const applyResult = await applyResponse.json();

        if (!applyResult.success) {
          console.error(`  ❌ Apply failed for integration ${integration.id}:`, applyResult.error);
          results.push({
            integration_id: integration.id,
            success: false,
            message: `Sync succeeded but apply failed: ${applyResult.error}`,
            simulation: shouldSimulate,
            sync_stats: {
              sales_imported: syncResult.sales_imported,
              line_items_imported: syncResult.line_items_imported,
              skipped_duplicates: syncResult.skipped_duplicates,
            },
          });
          continue;
        }

        console.log(`  ✅ Applied: ${applyResult.applied_count} sales, ${applyResult.total_revenue} revenue`);

        results.push({
          integration_id: integration.id,
          success: true,
          message: `Synced and applied successfully`,
          simulation: shouldSimulate,
          sync_stats: {
            sales_imported: syncResult.sales_imported,
            line_items_imported: syncResult.line_items_imported,
            skipped_duplicates: syncResult.skipped_duplicates,
          },
          apply_stats: {
            applied_count: applyResult.applied_count,
            skipped_unmapped: applyResult.skipped_unmapped,
            total_revenue: applyResult.total_revenue,
          },
        });

      } catch (syncError) {
        console.error(`❌ Error processing integration ${integration.id}:`, syncError);
        results.push({
          integration_id: integration.id,
          success: false,
          message: syncError instanceof Error ? syncError.message : "Unknown sync error",
          simulation: globalSimulateMode,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    // Calculate totals
    const totalStats = results.reduce((acc, r) => {
      if (r.sync_stats) {
        acc.sales_synced += r.sync_stats.sales_imported;
      }
      if (r.apply_stats) {
        acc.sales_applied += r.apply_stats.applied_count;
        acc.revenue += r.apply_stats.total_revenue;
      }
      return acc;
    }, { sales_synced: 0, sales_applied: 0, revenue: 0 });

    console.log(`=== SCHEDULED SYNC COMPLETE ===`);
    console.log(`Results: ${successCount} succeeded, ${failCount} failed`);
    console.log(`Totals: ${totalStats.sales_synced} synced, ${totalStats.sales_applied} applied, ${totalStats.revenue} revenue`);

    // Log the batch sync completion
    const { error: logError } = await adminClient.from("pos_sync_logs").insert({
      location_id: autoSyncIntegrations[0]?.location_id || "00000000-0000-0000-0000-000000000000",
      restaurant_id: autoSyncIntegrations[0]?.restaurant_id,
      pos_provider: "captiva",
      event_type: globalSimulateMode ? "simulation_auto_sync" : "auto_sync_daily",
      status: failCount === 0 ? "success" : (successCount > 0 ? "partial" : "fail"),
      message: `${globalSimulateMode ? "[SIMULATION] " : ""}Auto sync for ${dateFrom}: ${successCount}/${autoSyncIntegrations.length} succeeded. Synced ${totalStats.sales_synced}, applied ${totalStats.sales_applied}`,
      details: { 
        results, 
        date_from: dateFrom,
        date_to: dateTo,
        total: autoSyncIntegrations.length, 
        success: successCount, 
        failed: failCount, 
        simulation: globalSimulateMode,
        totals: totalStats,
      },
    });
    
    if (logError) console.error("Error logging sync:", logError);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${globalSimulateMode ? "[SIMULATION] " : ""}Auto sync completed: ${successCount}/${autoSyncIntegrations.length} integrations processed`,
        results,
        totals: totalStats,
        simulation_mode: globalSimulateMode,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Scheduled sync error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
