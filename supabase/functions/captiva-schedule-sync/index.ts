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

  try {
    console.log("Starting scheduled Captiva sync for all restaurants");

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

    const results: Array<{ integration_id: string; success: boolean; message: string }> = [];

    for (const integration of integrations) {
      try {
        console.log(`Syncing integration ${integration.id} for location ${integration.location_id}`);

        // Call the captiva-sync function internally
        const syncResponse = await fetch(`${supabaseUrl}/functions/v1/captiva-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ integration_id: integration.id }),
        });

        const syncResult = await syncResponse.json();

        results.push({
          integration_id: integration.id,
          success: syncResult.success,
          message: syncResult.message || syncResult.error || "Unknown result",
        });

        if (syncResult.success) {
          console.log(`Successfully synced integration ${integration.id}`);
        } else {
          console.error(`Failed to sync integration ${integration.id}:`, syncResult.error);
        }
      } catch (syncError) {
        console.error(`Error syncing integration ${integration.id}:`, syncError);
        results.push({
          integration_id: integration.id,
          success: false,
          message: syncError instanceof Error ? syncError.message : "Unknown sync error",
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`Scheduled sync completed: ${successCount} succeeded, ${failCount} failed`);

    // Log the batch sync completion
    const { error: logError } = await adminClient.from("pos_sync_logs").insert({
      location_id: integrations[0]?.location_id || "00000000-0000-0000-0000-000000000000",
      restaurant_id: integrations[0]?.restaurant_id,
      pos_provider: "captiva",
      event_type: "scheduled_batch_sync",
      status: failCount === 0 ? "success" : "partial",
      message: `Batch sync: ${successCount}/${integrations.length} succeeded`,
      details: { results, total: integrations.length, success: successCount, failed: failCount },
    });
    
    if (logError) console.error("Error logging sync:", logError);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Scheduled sync completed: ${successCount}/${integrations.length} integrations synced`,
        results,
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
