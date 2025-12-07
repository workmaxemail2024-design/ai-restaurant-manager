import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ================== TYPES ==================
interface SimulatedOrder {
  id: string;
  total: number;
  date: string;
  items: Array<{
    plu: string;
    name: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  operator_code: string;
}

interface SimulatedStaffEvent {
  operator_code: string;
  name: string;
  clock_in: string;
  clock_out: string | null;
}

interface Integration {
  id: string;
  location_id: string;
  restaurant_id: string | null;
  api_key: string | null;
  api_secret: string | null;
  settings: Record<string, unknown> | null;
}

interface SyncStats {
  orders_processed: number;
  sales_created: number;
  dishes_created: number;
  attendance_created: number;
  simulation_mode: boolean;
}

// ================== SIMULATION DATA GENERATOR ==================
function generateSimulatedData(): { orders: SimulatedOrder[]; staff_events: SimulatedStaffEvent[] } {
  const now = new Date();
  
  // Random timestamps within last 24 hours
  const randomHoursAgo = (maxHours: number) => {
    const hoursAgo = Math.random() * maxHours;
    return new Date(now.getTime() - hoursAgo * 3600000).toISOString();
  };

  // Generate 3-6 orders
  const orderCount = 3 + Math.floor(Math.random() * 4);
  const orders: SimulatedOrder[] = [];
  
  const menuItems = [
    { plu: "SIM-BURGER-001", name: "Classic Burger", price: 12.50 },
    { plu: "SIM-PIZZA-001", name: "Margherita Pizza", price: 15.90 },
    { plu: "SIM-STEAK-001", name: "Grilled Steak", price: 24.90 },
    { plu: "SIM-SALAD-001", name: "Caesar Salad", price: 8.50 },
    { plu: "SIM-PASTA-001", name: "Spaghetti Carbonara", price: 14.50 },
    { plu: "SIM-FRIES-001", name: "French Fries", price: 4.50 },
    { plu: "SIM-COLA-001", name: "Cola", price: 2.60 },
    { plu: "SIM-WATER-001", name: "Sparkling Water", price: 2.25 },
    { plu: "SIM-WINE-001", name: "House Wine", price: 6.80 },
    { plu: "SIM-DESSERT-001", name: "Chocolate Cake", price: 7.50 },
  ];

  const operators = ["SIM-OP-001", "SIM-OP-002", "SIM-OP-003"];

  for (let i = 0; i < orderCount; i++) {
    const itemCount = 1 + Math.floor(Math.random() * 4);
    const items: SimulatedOrder["items"] = [];
    let orderTotal = 0;

    for (let j = 0; j < itemCount; j++) {
      const item = menuItems[Math.floor(Math.random() * menuItems.length)];
      const quantity = 1 + Math.floor(Math.random() * 3);
      const itemTotal = item.price * quantity;
      orderTotal += itemTotal;
      
      items.push({
        plu: item.plu,
        name: item.name,
        quantity,
        price: item.price,
        total: Math.round(itemTotal * 100) / 100,
      });
    }

    orders.push({
      id: `sim-${Date.now()}-${i + 1000}`,
      total: Math.round(orderTotal * 100) / 100,
      date: randomHoursAgo(24),
      items,
      operator_code: operators[Math.floor(Math.random() * operators.length)],
    });
  }

  // Generate 1-3 staff attendance events
  const attendanceCount = 1 + Math.floor(Math.random() * 3);
  const staffNames = [
    { code: "SIM-OP-001", name: "John Smith" },
    { code: "SIM-OP-002", name: "Jane Doe" },
    { code: "SIM-OP-003", name: "Mike Johnson" },
  ];

  const staff_events: SimulatedStaffEvent[] = [];
  for (let i = 0; i < attendanceCount && i < staffNames.length; i++) {
    const staff = staffNames[i];
    const clockIn = new Date(now.getTime() - (4 + Math.random() * 4) * 3600000);
    const hasClockOut = Math.random() > 0.3;
    
    staff_events.push({
      operator_code: staff.code,
      name: staff.name,
      clock_in: clockIn.toISOString(),
      clock_out: hasClockOut ? new Date(clockIn.getTime() + (4 + Math.random() * 4) * 3600000).toISOString() : null,
    });
  }

  return { orders, staff_events };
}

// ================== MAIN SYNC LOGIC ==================
async function processOrders(
  adminClient: SupabaseClient,
  integration: Integration,
  orders: SimulatedOrder[],
  isSimulation: boolean
): Promise<{ sales_created: number; dishes_created: number }> {
  let salesCreated = 0;
  let dishesCreated = 0;

  for (const order of orders) {
    console.log(`Processing order ${order.id} with ${order.items.length} items`);

    for (const item of order.items) {
      // Find or create dish by captiva_external_id
      let dishId: string | null = null;

      const { data: existingDish } = await adminClient
        .from("dishes")
        .select("id")
        .eq("captiva_external_id", item.plu)
        .eq("restaurant_id", integration.restaurant_id)
        .maybeSingle();

      if (existingDish?.id) {
        dishId = existingDish.id;
      } else {
        // Check pos_mappings
        const { data: mapping } = await adminClient
          .from("pos_mappings")
          .select("internal_id")
          .eq("external_id", item.plu)
          .eq("pos_provider", "captiva")
          .eq("location_id", integration.location_id)
          .eq("is_verified", true)
          .maybeSingle();

        if (mapping?.internal_id) {
          dishId = mapping.internal_id;
        } else {
          // Create new dish
          const { data: newDish, error: dishError } = await adminClient
            .from("dishes")
            .insert({
              name: isSimulation ? `[Sim] ${item.name}` : `[Captiva] ${item.name}`,
              captiva_external_id: item.plu,
              restaurant_id: integration.restaurant_id,
              location_id: integration.location_id,
              selling_price: item.price,
              category: isSimulation ? "Simulated" : "Imported from POS",
            })
            .select("id")
            .single();

          if (dishError) {
            console.error(`Failed to create dish ${item.name}:`, dishError.message);
            continue;
          }

          dishId = newDish?.id || null;
          dishesCreated++;

          // Create mapping entry
          if (dishId) {
            await adminClient.from("pos_mappings").insert({
              location_id: integration.location_id,
              restaurant_id: integration.restaurant_id,
              pos_provider: "captiva",
              mapping_type: "dish",
              external_id: item.plu,
              external_name: item.name,
              internal_id: dishId,
              is_verified: false,
              confidence_score: isSimulation ? 100 : 80,
            });
          }
        }
      }

      if (!dishId) {
        console.warn(`Could not find or create dish for ${item.name}`);
        continue;
      }

      // Insert sale
      const saleDate = new Date(order.date).toISOString().split("T")[0];
      const { error: saleError } = await adminClient.from("sales").insert({
        dish_id: dishId,
        location_id: integration.location_id,
        restaurant_id: integration.restaurant_id,
        quantity: item.quantity,
        total_price: item.total,
        sale_date: saleDate,
      });

      if (saleError) {
        console.error(`Failed to create sale for ${item.name}:`, saleError.message);
      } else {
        salesCreated++;
      }

      // Also add to pos_sales_import for tracking
      await adminClient.from("pos_sales_import").upsert({
        location_id: integration.location_id,
        restaurant_id: integration.restaurant_id,
        pos_provider: "captiva",
        external_sale_id: `${order.id}-${item.plu}`,
        data: { order_id: order.id, item, order_date: order.date, simulation: isSimulation },
        mapped_dish_id: dishId,
        mapped_quantity: item.quantity,
        mapped_total_price: item.total,
        mapped_sale_date: saleDate,
        sync_status: "synced",
      }, { onConflict: "external_sale_id,location_id,pos_provider" });
    }
  }

  return { sales_created: salesCreated, dishes_created: dishesCreated };
}

async function processAttendance(
  adminClient: SupabaseClient,
  integration: Integration,
  staffEvents: SimulatedStaffEvent[],
  isSimulation: boolean
): Promise<number> {
  let attendanceCreated = 0;

  for (const event of staffEvents) {
    // Find or create staff by captiva_operator_code
    let staffId: string | null = null;

    const { data: existingStaff } = await adminClient
      .from("staff")
      .select("id")
      .eq("captiva_operator_code", event.operator_code)
      .eq("restaurant_id", integration.restaurant_id)
      .maybeSingle();

    if (existingStaff?.id) {
      staffId = existingStaff.id;
    } else {
      // Check pos_mappings for staff
      const { data: mapping } = await adminClient
        .from("pos_mappings")
        .select("internal_id")
        .eq("external_id", event.operator_code)
        .eq("pos_provider", "captiva")
        .eq("location_id", integration.location_id)
        .eq("mapping_type", "staff")
        .eq("is_verified", true)
        .maybeSingle();

      if (mapping?.internal_id) {
        staffId = mapping.internal_id;
      } else {
        // Create new staff member
        const nameParts = event.name.split(" ");
        const { data: newStaff, error: staffError } = await adminClient
          .from("staff")
          .insert({
            first_name: nameParts[0] || "Unknown",
            last_name: nameParts.slice(1).join(" ") || "Staff",
            captiva_operator_code: event.operator_code,
            restaurant_id: integration.restaurant_id,
            location_id: integration.location_id,
            role: "waiter",
            status: "active",
            hourly_rate: 15,
          })
          .select("id")
          .single();

        if (staffError) {
          console.error(`Failed to create staff ${event.name}:`, staffError.message);
          continue;
        }

        staffId = newStaff?.id || null;

        // Create mapping entry
        if (staffId) {
          await adminClient.from("pos_mappings").insert({
            location_id: integration.location_id,
            restaurant_id: integration.restaurant_id,
            pos_provider: "captiva",
            mapping_type: "staff",
            external_id: event.operator_code,
            external_name: event.name,
            internal_id: staffId,
            is_verified: false,
            confidence_score: isSimulation ? 100 : 80,
          });
        }
      }
    }

    if (!staffId) {
      console.warn(`Could not find or create staff for ${event.name}`);
      continue;
    }

    // Insert attendance record
    const { error: attendanceError } = await adminClient.from("staff_attendance").insert({
      staff_id: staffId,
      location_id: integration.location_id,
      restaurant_id: integration.restaurant_id,
      clock_in: event.clock_in,
      clock_out: event.clock_out,
      source: isSimulation ? "pos" : "pos",
    });

    if (attendanceError) {
      console.error(`Failed to create attendance for ${event.name}:`, attendanceError.message);
    } else {
      attendanceCreated++;
    }

    // Also add to pos_staff_import for tracking
    await adminClient.from("pos_staff_import").upsert({
      location_id: integration.location_id,
      restaurant_id: integration.restaurant_id,
      pos_provider: "captiva",
      external_staff_id: event.operator_code,
      data: { name: event.name, simulation: isSimulation },
      mapped_staff_id: staffId,
      clock_in: event.clock_in,
      clock_out: event.clock_out,
      sync_status: "synced",
    }, { onConflict: "external_staff_id,location_id,pos_provider" });
  }

  return attendanceCreated;
}

// ========================== MAIN FUNCTION ===============================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";

  if (!serviceRoleKey) {
    console.error("No service role key found");
    return new Response(
      JSON.stringify({ success: false, error: "Server configuration error: missing service role key" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { integration_id, location_id, restaurant_id, test_mode, simulate } = await req.json();

    console.log("=== CAPTIVA SYNC START ===");
    console.log("Request:", { integration_id, location_id, restaurant_id, test_mode, simulate });

    // Global simulate mode from environment
    const globalSimulateMode = Deno.env.get("SIMULATE_CAPTIVA") === "true";

    // Find integration using adminClient (bypasses RLS)
    let integrationQuery = adminClient
      .from("pos_integrations")
      .select("*")
      .eq("pos_provider", "captiva")
      .eq("status", "active");

    if (integration_id) {
      integrationQuery = integrationQuery.eq("id", integration_id);
    } else if (location_id) {
      integrationQuery = integrationQuery.eq("location_id", location_id);
    } else {
      console.error("Missing integration_id or location_id");
      return new Response(
        JSON.stringify({ success: false, error: "Either integration_id or location_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: integrationRows, error: integrationError } = await integrationQuery;

    console.log("Integration lookup result:", integrationRows?.length || 0, "rows found");
    if (integrationError) {
      console.error("Integration query error:", integrationError.message);
    }

    if (!integrationRows || integrationRows.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No active Captiva integration found",
          debug_integration_id: integration_id,
          debug_location_id: location_id,
          query_error: integrationError?.message,
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const integration = integrationRows[0] as Integration;

    // Get settings with defaults
    const settings = (integration.settings || {}) as Record<string, unknown>;
    const settingsSimulate = settings.simulate === true || settings.simulate === "true";
    const isSimulationMode = simulate === true || settingsSimulate || globalSimulateMode;
    const isTestMode = test_mode === true || settings.test_mode === "true";

    console.log("Mode:", { isSimulationMode, isTestMode, settingsSimulate, globalSimulateMode });

    let orders: SimulatedOrder[] = [];
    let staffEvents: SimulatedStaffEvent[] = [];
    let stats: SyncStats = {
      orders_processed: 0,
      sales_created: 0,
      dishes_created: 0,
      attendance_created: 0,
      simulation_mode: isSimulationMode,
    };

    // ================= SIMULATION MODE =================
    if (isSimulationMode) {
      console.log("🎮 SIMULATION MODE - Generating fake data");
      const simulated = generateSimulatedData();
      orders = simulated.orders;
      staffEvents = simulated.staff_events;
      console.log(`Generated ${orders.length} orders and ${staffEvents.length} staff events`);
    } else {
      // ================= LIVE MODE =================
      console.log("🔴 LIVE MODE - Would fetch from real Captiva API");
      
      const baseUrl = settings.base_url as string || "";
      const apiKey = integration.api_key || settings.api_key as string || "";
      const apiSecret = integration.api_secret || settings.api_secret as string || "";
      const storeId = settings.store_id as string || "";

      if (!baseUrl || !apiKey) {
        console.warn("Missing Captiva API credentials, falling back to simulation");
        const simulated = generateSimulatedData();
        orders = simulated.orders;
        staffEvents = simulated.staff_events;
        stats.simulation_mode = true;
      } else {
        // TODO: Implement real Captiva API calls here
        // For now, return empty if in live mode without proper API setup
        console.log("Real API mode - credentials present but API not implemented yet");
      }
    }

    // ================= PROCESS DATA =================
    if (orders.length > 0) {
      console.log(`Processing ${orders.length} orders...`);
      const orderStats = await processOrders(adminClient, integration, orders, stats.simulation_mode);
      stats.orders_processed = orders.length;
      stats.sales_created = orderStats.sales_created;
      stats.dishes_created = orderStats.dishes_created;
      console.log(`Created ${orderStats.sales_created} sales, ${orderStats.dishes_created} dishes`);
    }

    if (staffEvents.length > 0) {
      console.log(`Processing ${staffEvents.length} attendance events...`);
      stats.attendance_created = await processAttendance(adminClient, integration, staffEvents, stats.simulation_mode);
      console.log(`Created ${stats.attendance_created} attendance records`);
    }

    // ================= UPDATE INTEGRATION =================
    const updateSettings = {
      ...settings,
      last_sync_mode: stats.simulation_mode ? "simulation" : "live",
      last_sync_stats: stats,
    };

    const { error: updateError } = await adminClient
      .from("pos_integrations")
      .update({
        last_sync_time: new Date().toISOString(),
        settings: updateSettings,
      })
      .eq("id", integration.id);

    if (updateError) {
      console.error("Failed to update integration:", updateError.message);
    }

    // ================= LOG SYNC =================
    const { error: logError } = await adminClient.from("pos_sync_logs").insert({
      location_id: integration.location_id,
      restaurant_id: integration.restaurant_id,
      pos_provider: "captiva",
      event_type: stats.simulation_mode ? "simulation_sync" : "sync_completed",
      status: "success",
      message: `${stats.simulation_mode ? "[SIMULATION] " : ""}Sync completed: ${stats.sales_created} sales, ${stats.dishes_created} dishes, ${stats.attendance_created} attendance`,
      details: {
        orders_count: stats.orders_processed,
        sales_created: stats.sales_created,
        dishes_created: stats.dishes_created,
        attendance_created: stats.attendance_created,
        simulation_mode: stats.simulation_mode,
        timestamp: new Date().toISOString(),
      },
    });

    if (logError) {
      console.error("Failed to log sync:", logError.message);
    }

    console.log("=== CAPTIVA SYNC COMPLETE ===");
    console.log("Stats:", stats);

    return new Response(
      JSON.stringify({
        success: true,
        message: stats.simulation_mode
          ? `[SIMULATION] Sync completed: ${stats.sales_created} sales, ${stats.dishes_created} dishes, ${stats.attendance_created} attendance`
          : `Sync completed: ${stats.sales_created} sales, ${stats.dishes_created} dishes, ${stats.attendance_created} attendance`,
        data: stats,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
    console.error("=== CAPTIVA SYNC ERROR ===", errorMessage);

    // Try to log the error
    try {
      await adminClient.from("pos_sync_logs").insert({
        location_id: "00000000-0000-0000-0000-000000000000",
        pos_provider: "captiva",
        event_type: "sync_error",
        status: "fail",
        message: errorMessage,
        details: { error: errorMessage, timestamp: new Date().toISOString() },
      });
    } catch (logErr) {
      console.error("Failed to log error:", logErr);
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
