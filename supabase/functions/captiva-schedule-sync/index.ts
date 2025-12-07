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

    // Get all active Captiva integrations using admin client
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

    if (!integrations || integrations.length === 0) {
      console.log("No active Captiva integrations found");
      return new Response(
        JSON.stringify({ success: true, message: "No active Captiva integrations to sync" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${integrations.length} active Captiva integrations`);

    const results: Array<{ 
      integration_id: string; 
      success: boolean; 
      message: string; 
      simulation: boolean;
      stats?: {
        orders_processed: number;
        sales_created: number;
        dishes_created: number;
        attendance_created: number;
      };
    }> = [];

    for (const integration of integrations) {
      try {
        // Check if this integration has simulation mode enabled in settings
        const settings = (integration.settings || {}) as Record<string, unknown>;
        const integrationSimulate = settings.simulate === true || settings.simulate === "true";
        const shouldSimulate = globalSimulateMode || integrationSimulate;

        console.log(`Syncing integration ${integration.id} for location ${integration.location_id} (simulation: ${shouldSimulate})`);

        // Call the captiva-sync function using fetch
        const syncResponse = await fetch(`${supabaseUrl}/functions/v1/captiva-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ 
            integration_id: integration.id,
            location_id: integration.location_id,
            restaurant_id: integration.restaurant_id,
            simulate: shouldSimulate,
          }),
        });

        const syncResult = await syncResponse.json();

        results.push({
          integration_id: integration.id,
          success: syncResult.success,
          message: syncResult.message || syncResult.error || "Unknown result",
          simulation: shouldSimulate,
          stats: syncResult.data,
        });

        if (syncResult.success) {
          console.log(`✅ Successfully synced integration ${integration.id}`);
          if (syncResult.data) {
            console.log(`   Stats: ${syncResult.data.sales_created} sales, ${syncResult.data.dishes_created} dishes, ${syncResult.data.attendance_created} attendance`);
          }
        } else {
          console.error(`❌ Failed to sync integration ${integration.id}:`, syncResult.error);
        }
      } catch (syncError) {
        console.error(`❌ Error syncing integration ${integration.id}:`, syncError);
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
      if (r.stats) {
        acc.sales += r.stats.sales_created;
        acc.dishes += r.stats.dishes_created;
        acc.attendance += r.stats.attendance_created;
      }
      return acc;
    }, { sales: 0, dishes: 0, attendance: 0 });

    console.log(`=== SCHEDULED SYNC COMPLETE ===`);
    console.log(`Results: ${successCount} succeeded, ${failCount} failed`);
    console.log(`Totals: ${totalStats.sales} sales, ${totalStats.dishes} dishes, ${totalStats.attendance} attendance`);

    // Log the batch sync completion
    const { error: logError } = await adminClient.from("pos_sync_logs").insert({
      location_id: integrations[0]?.location_id || "00000000-0000-0000-0000-000000000000",
      restaurant_id: integrations[0]?.restaurant_id,
      pos_provider: "captiva",
      event_type: globalSimulateMode ? "simulation_scheduled_batch_sync" : "scheduled_batch_sync",
      status: failCount === 0 ? "success" : "partial",
      message: `${globalSimulateMode ? "[SIMULATION] " : ""}Batch sync: ${successCount}/${integrations.length} succeeded. Total: ${totalStats.sales} sales, ${totalStats.dishes} dishes, ${totalStats.attendance} attendance`,
      details: { 
        results, 
        total: integrations.length, 
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
        message: `${globalSimulateMode ? "[SIMULATION] " : ""}Scheduled sync completed: ${successCount}/${integrations.length} integrations synced`,
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
