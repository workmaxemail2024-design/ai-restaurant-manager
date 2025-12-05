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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Check global simulation mode
  const globalSimulateMode = Deno.env.get("SIMULATE_CAPTIVA") === "true";

  try {
    console.log(`Starting scheduled Captiva sync for all restaurants (simulation_mode: ${globalSimulateMode})`);

    // Get all active Captiva integrations
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

    const results: Array<{ integration_id: string; success: boolean; message: string; simulation: boolean }> = [];

    for (const integration of integrations) {
      try {
        console.log(`Syncing integration ${integration.id} for location ${integration.location_id} (simulation: ${globalSimulateMode})`);

        // Call the captiva-sync function internally, passing simulation flag
        const syncResponse = await fetch(`${supabaseUrl}/functions/v1/captiva-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ 
            integration_id: integration.id,
            simulate: globalSimulateMode 
          }),
        });

        const syncResult = await syncResponse.json();

        results.push({
          integration_id: integration.id,
          success: syncResult.success,
          message: syncResult.message || syncResult.error || "Unknown result",
          simulation: globalSimulateMode,
        });

        if (syncResult.success) {
          console.log(`Successfully synced integration ${integration.id} (simulation: ${globalSimulateMode})`);
        } else {
          console.error(`Failed to sync integration ${integration.id}:`, syncResult.error);
        }
      } catch (syncError) {
        console.error(`Error syncing integration ${integration.id}:`, syncError);
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

    console.log(`Scheduled sync completed: ${successCount} succeeded, ${failCount} failed (simulation: ${globalSimulateMode})`);

    // Log the batch sync completion
    const { error: logError } = await adminClient.from("pos_sync_logs").insert({
      location_id: integrations[0]?.location_id || "00000000-0000-0000-0000-000000000000",
      restaurant_id: integrations[0]?.restaurant_id,
      pos_provider: "captiva",
      event_type: globalSimulateMode ? "simulation_scheduled_batch_sync" : "scheduled_batch_sync",
      status: failCount === 0 ? "success" : "partial",
      message: `${globalSimulateMode ? "[SIMULATION] " : ""}Batch sync: ${successCount}/${integrations.length} succeeded`,
      details: { results, total: integrations.length, success: successCount, failed: failCount, simulation: globalSimulateMode },
    });
    
    if (logError) console.error("Error logging sync:", logError);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${globalSimulateMode ? "[SIMULATION] " : ""}Scheduled sync completed: ${successCount}/${integrations.length} integrations synced`,
        results,
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
