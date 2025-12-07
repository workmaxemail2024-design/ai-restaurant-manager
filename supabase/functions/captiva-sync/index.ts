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
  skipped_sales: number;
  skipped_dishes: number;
  skipped_attendance: number;
  validation_errors: ValidationError[];
}

interface ValidationError {
  type: "sale" | "dish" | "staff" | "attendance";
  record_id: string;
  field: string;
  message: string;
  raw_data?: unknown;
}

// ================== VALIDATION SYSTEM ==================
function validatePosRecord(
  type: "sale" | "dish" | "staff" | "attendance",
  record: unknown
): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const data = record as Record<string, unknown>;
  const recordId = (data?.id || data?.plu || data?.operator_code || "unknown") as string;

  if (type === "sale") {
    if (!data?.name && !data?.plu) {
      errors.push({ type, record_id: recordId, field: "name", message: "Dish name or PLU is missing" });
    }
    if (data?.price === undefined || data?.price === null || isNaN(Number(data?.price))) {
      errors.push({ type, record_id: recordId, field: "price", message: "Price is missing or not numeric" });
    }
    if (!data?.quantity || isNaN(Number(data?.quantity))) {
      errors.push({ type, record_id: recordId, field: "quantity", message: "Quantity is missing or invalid" });
    }
  }

  if (type === "dish") {
    if (!data?.name) {
      errors.push({ type, record_id: recordId, field: "name", message: "Dish name is required" });
    }
    if (!data?.plu && !data?.external_id) {
      errors.push({ type, record_id: recordId, field: "external_id", message: "External ID (PLU) is required" });
    }
  }

  if (type === "staff") {
    if (!data?.operator_code) {
      errors.push({ type, record_id: recordId, field: "operator_code", message: "Operator code is required" });
    }
    if (!data?.name) {
      errors.push({ type, record_id: recordId, field: "name", message: "Staff name is required" });
    }
  }

  if (type === "attendance") {
    if (!data?.clock_in) {
      errors.push({ type, record_id: recordId, field: "clock_in", message: "Clock in time is required" });
    }
    if (data?.clock_out && data?.clock_in) {
      const clockIn = new Date(data.clock_in as string);
      const clockOut = new Date(data.clock_out as string);
      if (clockOut <= clockIn) {
        errors.push({ type, record_id: recordId, field: "clock_out", message: "Clock out must be after clock in" });
      }
    }
    if (!data?.operator_code) {
      errors.push({ type, record_id: recordId, field: "operator_code", message: "Operator/staff mapping is required" });
    }
  }

  return { valid: errors.length === 0, errors };
}

// ================== SIMULATION DATA GENERATOR ==================
function generateSimulatedData(): { orders: SimulatedOrder[]; staff_events: SimulatedStaffEvent[] } {
  const now = new Date();
  
  const randomHoursAgo = (maxHours: number) => {
    const hoursAgo = Math.random() * maxHours;
    return new Date(now.getTime() - hoursAgo * 3600000).toISOString();
  };

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
  isSimulation: boolean,
  stats: SyncStats
): Promise<void> {
  for (const order of orders) {
    console.log(`Processing order ${order.id} with ${order.items.length} items`);

    for (const item of order.items) {
      // Validate sale item
      const validation = validatePosRecord("sale", { 
        id: `${order.id}-${item.plu}`,
        name: item.name, 
        plu: item.plu, 
        price: item.price, 
        quantity: item.quantity,
        date: order.date
      });

      if (!validation.valid) {
        stats.skipped_sales++;
        stats.validation_errors.push(...validation.errors);
        console.warn(`Skipping invalid sale item: ${item.plu}`, validation.errors);
        continue;
      }

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
          // Validate dish before creation
          const dishValidation = validatePosRecord("dish", { name: item.name, plu: item.plu });
          if (!dishValidation.valid) {
            stats.skipped_dishes++;
            stats.validation_errors.push(...dishValidation.errors);
            continue;
          }

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
            stats.skipped_dishes++;
            stats.validation_errors.push({
              type: "dish",
              record_id: item.plu,
              field: "insert",
              message: dishError.message
            });
            continue;
          }

          dishId = newDish?.id || null;
          stats.dishes_created++;

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
        stats.skipped_sales++;
        continue;
      }

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
        stats.skipped_sales++;
        stats.validation_errors.push({
          type: "sale",
          record_id: `${order.id}-${item.plu}`,
          field: "insert",
          message: saleError.message
        });
      } else {
        stats.sales_created++;
      }

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
}

async function processAttendance(
  adminClient: SupabaseClient,
  integration: Integration,
  staffEvents: SimulatedStaffEvent[],
  isSimulation: boolean,
  stats: SyncStats
): Promise<void> {
  for (const event of staffEvents) {
    // Validate attendance record
    const validation = validatePosRecord("attendance", {
      operator_code: event.operator_code,
      name: event.name,
      clock_in: event.clock_in,
      clock_out: event.clock_out
    });

    if (!validation.valid) {
      stats.skipped_attendance++;
      stats.validation_errors.push(...validation.errors);
      console.warn(`Skipping invalid attendance: ${event.operator_code}`, validation.errors);
      continue;
    }

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
        // Validate staff before creation
        const staffValidation = validatePosRecord("staff", { operator_code: event.operator_code, name: event.name });
        if (!staffValidation.valid) {
          stats.skipped_attendance++;
          stats.validation_errors.push(...staffValidation.errors);
          continue;
        }

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
          stats.skipped_attendance++;
          stats.validation_errors.push({
            type: "staff",
            record_id: event.operator_code,
            field: "insert",
            message: staffError.message
          });
          continue;
        }

        staffId = newStaff?.id || null;

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
      stats.skipped_attendance++;
      continue;
    }

    const { error: attendanceError } = await adminClient.from("staff_attendance").insert({
      staff_id: staffId,
      location_id: integration.location_id,
      restaurant_id: integration.restaurant_id,
      clock_in: event.clock_in,
      clock_out: event.clock_out,
      source: "pos",
    });

    if (attendanceError) {
      console.error(`Failed to create attendance for ${event.name}:`, attendanceError.message);
      stats.skipped_attendance++;
      stats.validation_errors.push({
        type: "attendance",
        record_id: event.operator_code,
        field: "insert",
        message: attendanceError.message
      });
    } else {
      stats.attendance_created++;
    }

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

    const globalSimulateMode = Deno.env.get("SIMULATE_CAPTIVA") === "true";

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

    const settings = (integration.settings || {}) as Record<string, unknown>;
    const settingsSimulate = settings.simulate === true || settings.simulate === "true";
    const isSimulationMode = simulate === true || settingsSimulate || globalSimulateMode;
    const isTestMode = test_mode === true || settings.test_mode === "true";

    console.log("Mode:", { isSimulationMode, isTestMode, settingsSimulate, globalSimulateMode });

    let orders: SimulatedOrder[] = [];
    let staffEvents: SimulatedStaffEvent[] = [];
    const stats: SyncStats = {
      orders_processed: 0,
      sales_created: 0,
      dishes_created: 0,
      attendance_created: 0,
      simulation_mode: isSimulationMode,
      skipped_sales: 0,
      skipped_dishes: 0,
      skipped_attendance: 0,
      validation_errors: [],
    };

    if (isSimulationMode) {
      console.log("🎮 SIMULATION MODE - Generating fake data");
      const simulated = generateSimulatedData();
      orders = simulated.orders;
      staffEvents = simulated.staff_events;
      console.log(`Generated ${orders.length} orders and ${staffEvents.length} staff events`);
    } else {
      console.log("🔴 LIVE MODE - Would fetch from real Captiva API");
      
      const baseUrl = settings.base_url as string || "";
      const apiKey = integration.api_key || settings.api_key as string || "";

      if (!baseUrl || !apiKey) {
        console.warn("Missing Captiva API credentials, falling back to simulation");
        const simulated = generateSimulatedData();
        orders = simulated.orders;
        staffEvents = simulated.staff_events;
        stats.simulation_mode = true;
      } else {
        console.log("Real API mode - credentials present but API not implemented yet");
      }
    }

    if (orders.length > 0) {
      console.log(`Processing ${orders.length} orders...`);
      stats.orders_processed = orders.length;
      await processOrders(adminClient, integration, orders, stats.simulation_mode, stats);
      console.log(`Created ${stats.sales_created} sales, ${stats.dishes_created} dishes, skipped ${stats.skipped_sales} sales`);
    }

    if (staffEvents.length > 0) {
      console.log(`Processing ${staffEvents.length} attendance events...`);
      await processAttendance(adminClient, integration, staffEvents, stats.simulation_mode, stats);
      console.log(`Created ${stats.attendance_created} attendance records, skipped ${stats.skipped_attendance}`);
    }

    const updateSettings = {
      ...settings,
      last_sync_mode: stats.simulation_mode ? "simulation" : "live",
      last_sync_stats: {
        orders_processed: stats.orders_processed,
        sales_created: stats.sales_created,
        dishes_created: stats.dishes_created,
        attendance_created: stats.attendance_created,
        skipped_sales: stats.skipped_sales,
        skipped_dishes: stats.skipped_dishes,
        skipped_attendance: stats.skipped_attendance,
      },
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

    // Log sync with validation results
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
        skipped_sales: stats.skipped_sales,
        skipped_dishes: stats.skipped_dishes,
        skipped_attendance: stats.skipped_attendance,
        validation_errors: stats.validation_errors,
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
        data: {
          ...stats,
          validation_errors: stats.validation_errors.length > 0 ? stats.validation_errors : undefined,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
    console.error("=== CAPTIVA SYNC ERROR ===", errorMessage);

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
