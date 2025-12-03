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
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's auth context to verify authentication
    const userSupabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await userSupabase.auth.getUser();
    if (authError || !user) {
      console.error("Authentication error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role for data operations after auth is verified
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { location_id, pos_provider, clock_events } = await req.json();

    if (!location_id || !pos_provider || !clock_events) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has access to this location's restaurant
    const { data: location, error: locationError } = await userSupabase
      .from("locations")
      .select("id, restaurant_id")
      .eq("id", location_id)
      .single();

    if (locationError || !location) {
      console.error("Location access error:", locationError);
      return new Response(
        JSON.stringify({ error: "Access denied to this location" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get staff mappings
    const { data: mappings } = await supabase
      .from("pos_mappings")
      .select("*")
      .eq("location_id", location_id)
      .eq("pos_provider", pos_provider)
      .eq("mapping_type", "staff");

    const mappingMap = new Map(mappings?.map(m => [m.external_id, m]) || []);

    // Get all staff for matching
    const { data: staffList } = await supabase.from("staff").select("id, first_name, last_name");

    const results = { imported: 0, mapped: 0, unmapped: 0, errors: [] as string[] };

    for (const event of clock_events) {
      try {
        const externalStaffId = event.employee_id || event.staff_id || event.user_id;
        const staffName = event.employee_name || event.staff_name || event.name;

        let mappedStaffId = null;
        const existingMapping = mappingMap.get(externalStaffId);

        if (existingMapping?.internal_id) {
          mappedStaffId = existingMapping.internal_id;
        } else if (staffList && staffName) {
          const match = staffList.find(s => 
            `${s.first_name} ${s.last_name}`.toLowerCase().includes(staffName.toLowerCase()) ||
            staffName.toLowerCase().includes(`${s.first_name} ${s.last_name}`.toLowerCase())
          );
          if (match) {
            mappedStaffId = match.id;
            await supabase.from("pos_mappings").upsert({
              location_id,
              pos_provider,
              mapping_type: "staff",
              external_id: externalStaffId,
              external_name: staffName,
              internal_id: match.id,
              confidence_score: 0.7,
              is_verified: false,
            });
          }
        }

        // Store raw import
        await supabase.from("pos_staff_import").insert({
          location_id,
          external_staff_id: externalStaffId,
          pos_provider,
          clock_in: event.clock_in || event.start_time,
          clock_out: event.clock_out || event.end_time,
          mapped_staff_id: mappedStaffId,
          data: event,
          sync_status: mappedStaffId ? "mapped" : "pending",
        });

        results.imported++;

        // If mapped, insert into staff_attendance
        if (mappedStaffId) {
          await supabase.from("staff_attendance").insert({
            staff_id: mappedStaffId,
            location_id,
            clock_in: event.clock_in || event.start_time,
            clock_out: event.clock_out || event.end_time,
            source: "pos",
          });
          results.mapped++;
        } else {
          results.unmapped++;
        }
      } catch (err) {
        results.errors.push(err instanceof Error ? err.message : "Unknown error");
      }
    }

    // Log sync
    await supabase.from("pos_sync_logs").insert({
      location_id,
      pos_provider,
      event_type: "staff_import",
      message: `Imported ${results.imported} clock events`,
      status: results.errors.length > 0 ? "partial" : "success",
      details: results,
    });

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("POS import staff error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
