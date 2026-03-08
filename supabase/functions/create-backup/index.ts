import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the calling user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin permission
    const { data: isAdmin } = await userClient.rpc("user_is_manager_or_owner");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: restaurantId } = await userClient.rpc("get_user_restaurant_id");
    if (!restaurantId) {
      return new Response(JSON.stringify({ error: "No restaurant found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const backupType = body.backup_type || "manual";

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Create pending record
    const { data: backup, error: insertError } = await adminClient
      .from("system_backups")
      .insert({
        restaurant_id: restaurantId,
        status: "pending",
        backup_type: backupType,
        created_by: backupType === "manual" ? user.id : null,
      })
      .select()
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Simulate backup process — in production this would trigger pg_dump or
    // Supabase management API backup. We log metadata for wiring later.
    const tables = [
      "restaurants", "locations", "staff", "dishes", "ingredients",
      "sales", "purchase_orders", "reservations", "reservation_tables",
      "reservation_customers", "reservation_sittings", "stock_levels",
      "suppliers", "menus", "notifications", "automation_rules",
    ];

    let totalRows = 0;
    for (const table of tables) {
      const { count } = await adminClient
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId);
      totalRows += count || 0;
    }

    const estimatedSize = totalRows * 256; // rough estimate bytes per row
    const filePath = `backups/${restaurantId}/${backup.id}.json`;

    // Mark success
    await adminClient
      .from("system_backups")
      .update({
        status: "success",
        file_path: filePath,
        size_bytes: estimatedSize,
        notes: `Catalogued ${totalRows} rows across ${tables.length} tables`,
      })
      .eq("id", backup.id);

    // Cleanup: keep only last 14 daily backups
    const { data: oldBackups } = await adminClient
      .from("system_backups")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("backup_type", "daily")
      .order("created_at", { ascending: false })
      .range(14, 1000);

    if (oldBackups && oldBackups.length > 0) {
      await adminClient
        .from("system_backups")
        .delete()
        .in("id", oldBackups.map((b: any) => b.id));
    }

    return new Response(
      JSON.stringify({
        success: true,
        backup_id: backup.id,
        rows_catalogued: totalRows,
        estimated_size: estimatedSize,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
