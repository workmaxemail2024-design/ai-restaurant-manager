import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============ SIMULATION DATA GENERATOR ============
function generateSimulatedData() {
  const now = new Date();
  const baseDate = now.toISOString();
  
  return {
    orders: [
      {
        id: `sim-${Date.now()}-1001`,
        total: 45.80,
        date: baseDate,
        items: [
          { plu: "burger-001", name: "Classic Burger", quantity: 2, price: 12.50, total: 25.00 },
          { plu: "fries-001", name: "French Fries", quantity: 1, price: 3.30, total: 3.30 },
          { plu: "cola-001", name: "Cola", quantity: 2, price: 2.60, total: 5.20 }
        ],
        operator_code: "SIM-OP-001"
      },
      {
        id: `sim-${Date.now()}-1002`,
        total: 32.90,
        date: new Date(now.getTime() - 30 * 60000).toISOString(),
        items: [
          { plu: "pizza-001", name: "Margherita Pizza", quantity: 1, price: 15.90, total: 15.90 },
          { plu: "salad-001", name: "Caesar Salad", quantity: 1, price: 8.50, total: 8.50 },
          { plu: "water-001", name: "Sparkling Water", quantity: 2, price: 2.25, total: 4.50 }
        ],
        operator_code: "SIM-OP-002"
      },
      {
        id: `sim-${Date.now()}-1003`,
        total: 67.40,
        date: new Date(now.getTime() - 60 * 60000).toISOString(),
        items: [
          { plu: "steak-001", name: "Grilled Steak", quantity: 2, price: 24.90, total: 49.80 },
          { plu: "wine-001", name: "House Wine", quantity: 2, price: 6.80, total: 13.60 }
        ],
        operator_code: "SIM-OP-001"
      }
    ],
    staff_events: [
      {
        operator_code: "SIM-OP-001",
        name: "John Smith",
        clock_in: new Date(now.getTime() - 4 * 3600000).toISOString(),
        clock_out: null
      },
      {
        operator_code: "SIM-OP-002",
        name: "Jane Doe",
        clock_in: new Date(now.getTime() - 3 * 3600000).toISOString(),
        clock_out: null
      }
    ]
  };
}

// XML to JSON converter for Captiva responses
function parseXmlToJson(xml: string): Record<string, unknown> {
  xml = xml.replace(/<\?xml[^>]*\?>/g, '').trim();
  
  const parseElement = (xmlStr: string): Record<string, unknown> | string => {
    const obj: Record<string, unknown> = {};
    const tagRegex = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>/g;
    let match;
    let hasChildren = false;
    
    while ((match = tagRegex.exec(xmlStr)) !== null) {
      hasChildren = true;
      const [, tagName, , content] = match;
      const trimmedContent = content.trim();
      
      if (/<\w+[^>]*>/.test(trimmedContent)) {
        const parsed = parseElement(trimmedContent);
        if (obj[tagName]) {
          if (Array.isArray(obj[tagName])) {
            (obj[tagName] as unknown[]).push(parsed);
          } else {
            obj[tagName] = [obj[tagName], parsed];
          }
        } else {
          obj[tagName] = parsed;
        }
      } else {
        let value: unknown = trimmedContent;
        if (trimmedContent === '') value = null;
        else if (trimmedContent === 'true') value = true;
        else if (trimmedContent === 'false') value = false;
        else if (/^-?\d+$/.test(trimmedContent)) value = parseInt(trimmedContent);
        else if (/^-?\d+\.\d+$/.test(trimmedContent)) value = parseFloat(trimmedContent);
        
        if (obj[tagName]) {
          if (Array.isArray(obj[tagName])) {
            (obj[tagName] as unknown[]).push(value);
          } else {
            obj[tagName] = [obj[tagName], value];
          }
        } else {
          obj[tagName] = value;
        }
      }
    }
    
    return hasChildren ? obj : xmlStr;
  };
  
  return parseElement(xml) as Record<string, unknown>;
}

interface CaptivaOrder {
  id?: string;
  order_id?: string;
  order_number?: string;
  date?: string;
  timestamp?: string;
  total?: number | string;
  subtotal?: number | string;
  tax?: number | string;
  items?: CaptivaOrderItem[] | CaptivaOrderItem;
  payments?: CaptivaPayment[] | CaptivaPayment;
  staff_id?: string;
  employee_id?: string;
  operator_code?: string;
}

interface CaptivaOrderItem {
  plu?: string;
  sku?: string;
  item_id?: string;
  name?: string;
  quantity?: number | string;
  price?: number | string;
  total?: number | string;
}

interface CaptivaPayment {
  method?: string;
  type?: string;
  amount?: number | string;
}

interface CaptivaAttendance {
  operator_code?: string;
  employee_id?: string;
  staff_id?: string;
  name?: string;
  clock_in?: string;
  clock_out?: string;
  date?: string;
}

interface Integration {
  id: string;
  location_id: string;
  restaurant_id: string | null;
  api_key: string | null;
  api_secret: string | null;
  settings: Record<string, string> | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // deno-lint-ignore no-explicit-any
    const adminClient: SupabaseClient<any> = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { integration_id, location_id, test_mode, simulate } = await req.json();

    // Check global simulation mode or per-request simulate flag
    const globalSimulateMode = Deno.env.get("SIMULATE_CAPTIVA") === "true";
    const isSimulationMode = simulate === true || globalSimulateMode;

    // Get the Captiva integration
    const { data: integration, error: intError } = await supabase
      .from("pos_integrations")
      .select("*")
      .eq("pos_provider", "captiva")
      .eq(integration_id ? "id" : "location_id", integration_id || location_id)
      .eq("status", "active")
      .single();

    if (intError || !integration) {
      console.error("Integration error:", intError);
      return new Response(
        JSON.stringify({ success: false, error: "Captiva integration not found or inactive" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typedIntegration = integration as Integration;
    const settings = typedIntegration.settings || {};
    const baseUrl = settings.base_url;
    const storeId = settings.store_id;
    const apiKey = typedIntegration.api_key;
    const apiSecret = typedIntegration.api_secret;
    const isTestMode = test_mode === true || settings.test_mode === "true";

    console.log(`Starting Captiva sync for location ${typedIntegration.location_id}, simulation_mode: ${isSimulationMode}, test_mode: ${isTestMode}`);

    let orders: CaptivaOrder[] = [];
    let attendanceRecords: CaptivaAttendance[] = [];

    // ============ SIMULATION MODE ============
    if (isSimulationMode) {
      console.log("🎮 SIMULATION MODE ACTIVE - Using simulated Captiva data");
      const simulatedData = generateSimulatedData();
      orders = simulatedData.orders as unknown as CaptivaOrder[];
      attendanceRecords = simulatedData.staff_events as unknown as CaptivaAttendance[];
    } else {
      // ============ REAL API MODE ============
      if (!baseUrl || !apiKey || !apiSecret) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing Captiva credentials in integration settings" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const authString = btoa(`${apiKey}:${apiSecret}`);
      const lastSync = settings.last_sync_time ? new Date(settings.last_sync_time) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const fromDate = lastSync.toISOString();
      const toDate = new Date().toISOString();

      // Helper to make Captiva API requests
      const captivaFetch = async (endpoint: string) => {
        const url = storeId
          ? `${baseUrl.replace(/\/$/, '')}/api/v1/stores/${storeId}${endpoint}`
          : `${baseUrl.replace(/\/$/, '')}/api/v1${endpoint}`;
        
        console.log(`Fetching: ${url}`);
        const response = await fetch(url, {
          headers: {
            "Authorization": `Basic ${authString}`,
            "Accept": "application/json, application/xml",
          },
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Captiva API error ${response.status}: ${errorText.substring(0, 200)}`);
        }
        
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("xml")) {
          const xmlText = await response.text();
          return parseXmlToJson(xmlText);
        }
        return await response.json();
      };

      // Fetch attendance (skip in test mode)
      if (!isTestMode) {
        try {
          const attendanceData = await captivaFetch(`/attendance?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`);
          attendanceRecords = Array.isArray(attendanceData.attendance)
            ? attendanceData.attendance
            : (attendanceData.attendance ? [attendanceData.attendance] : []);
        } catch (attError) {
          console.log("Attendance fetch skipped or failed:", attError instanceof Error ? attError.message : "Unknown error");
        }
      }

      // Fetch orders
      const ordersData = await captivaFetch(`/orders?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`);
      orders = Array.isArray(ordersData.orders) 
        ? ordersData.orders
        : (ordersData.order ? [ordersData.order] : []);
    }

    const now = new Date();
    let salesCreated = 0;
    let dishesCreated = 0;
    let mappingsCreated = 0;
    let attendanceCreated = 0;
    const unmappedStaff: string[] = [];

    // Load staff mapping cache
    const { data: staffList } = await adminClient
      .from("staff")
      .select("id, captiva_operator_code, location_id")
      .eq("restaurant_id", typedIntegration.restaurant_id)
      .not("captiva_operator_code", "is", null);

    const staffByOperatorCode: Record<string, { id: string; location_id: string | null }> = {};
    staffList?.forEach(s => {
      if (s.captiva_operator_code) {
        staffByOperatorCode[s.captiva_operator_code] = { id: s.id, location_id: s.location_id };
      }
    });

    // Process attendance records
    if (!isTestMode) {
      console.log(`Processing ${attendanceRecords.length} attendance records`);

      for (const record of attendanceRecords) {
        const operatorCode = record.operator_code || record.employee_id || record.staff_id;
        if (!operatorCode) continue;

        const staffMatch = staffByOperatorCode[operatorCode];
        if (!staffMatch) {
          if (!unmappedStaff.includes(operatorCode)) {
            unmappedStaff.push(operatorCode);
            console.log(`Unmapped staff: operator_code ${operatorCode}`);
          }
          continue;
        }

        if (record.clock_in) {
          const { error: attError } = await adminClient.from("staff_attendance").upsert({
            staff_id: staffMatch.id,
            location_id: staffMatch.location_id || typedIntegration.location_id,
            restaurant_id: typedIntegration.restaurant_id,
            clock_in: record.clock_in,
            clock_out: record.clock_out || null,
            source: "pos",
          }, {
            onConflict: "staff_id,clock_in",
          });

          if (!attError) attendanceCreated++;
        }
      }
    }

    console.log(`Processing ${orders.length} orders`);

    for (const order of orders) {
      const orderId = order.id || order.order_id || order.order_number || `unknown-${Date.now()}`;
      const orderDate = order.date || order.timestamp || new Date().toISOString();
      const items: CaptivaOrderItem[] = Array.isArray(order.items) ? order.items : (order.items ? [order.items] : []);

      // Check staff mapping for order
      const orderOperatorCode = order.operator_code || order.staff_id || order.employee_id;
      if (orderOperatorCode && !staffByOperatorCode[orderOperatorCode] && !unmappedStaff.includes(orderOperatorCode)) {
        unmappedStaff.push(orderOperatorCode);
        console.log(`Unmapped staff: operator_code ${orderOperatorCode}`);
      }

      for (const item of items) {
        const externalId = item.plu || item.sku || item.item_id || "";
        const itemName = item.name || `Item ${externalId}`;
        const quantity = typeof item.quantity === 'string' ? parseInt(item.quantity) : (item.quantity || 1);
        const price = typeof item.price === 'string' ? parseFloat(item.price) : (item.price || 0);
        const totalPrice = typeof item.total === 'string' ? parseFloat(item.total) : (item.total || price * quantity);

        if (!externalId) continue;

        // Check if dish exists by captiva_external_id
        const { data: existingDish } = await supabase
          .from("dishes")
          .select("id")
          .eq("captiva_external_id", externalId)
          .eq("restaurant_id", typedIntegration.restaurant_id)
          .single();

        let dishId: string | null = existingDish?.id || null;

        // If not found, check pos_mappings
        if (!dishId) {
          const { data: mapping } = await supabase
            .from("pos_mappings")
            .select("internal_id")
            .eq("external_id", externalId)
            .eq("pos_provider", "captiva")
            .eq("location_id", typedIntegration.location_id)
            .eq("is_verified", true)
            .single();

          if (mapping?.internal_id) {
            dishId = mapping.internal_id;
          }
        }

        // Create placeholder dish if not found (skip in test mode, allow in simulation)
        if (!dishId && !isTestMode) {
          const { data: newDish, error: dishError } = await adminClient
            .from("dishes")
            .insert({
              name: isSimulationMode ? `[Simulated] ${itemName}` : `[Captiva] ${itemName}`,
              captiva_external_id: externalId,
              restaurant_id: typedIntegration.restaurant_id,
              location_id: typedIntegration.location_id,
              selling_price: price,
              category: isSimulationMode ? "Simulated from POS" : "Imported from POS",
            })
            .select("id")
            .single();

          if (dishError) {
            console.error("Error creating dish:", dishError);
          } else if (newDish) {
            dishId = newDish.id;
            dishesCreated++;
          }

          // Create mapping
          const { error: mapError } = await adminClient.from("pos_mappings").insert({
            location_id: typedIntegration.location_id,
            restaurant_id: typedIntegration.restaurant_id,
            pos_provider: "captiva",
            mapping_type: "dish",
            external_id: externalId,
            external_name: itemName,
            internal_id: dishId,
            is_verified: false,
          });
          if (!mapError) mappingsCreated++;
        }

        if (dishId && !isTestMode) {
          const saleDate = new Date(orderDate).toISOString().split('T')[0];
          
          await adminClient.from("pos_sales_import").insert({
            location_id: typedIntegration.location_id,
            restaurant_id: typedIntegration.restaurant_id,
            pos_provider: "captiva",
            external_sale_id: `${orderId}-${externalId}`,
            data: { 
              order_id: orderId, 
              item, 
              order_date: orderDate, 
              operator_code: orderOperatorCode,
              simulation: isSimulationMode 
            },
            mapped_dish_id: dishId,
            mapped_quantity: quantity,
            mapped_total_price: totalPrice,
            mapped_sale_date: saleDate,
            sync_status: "synced",
          });

          const { error: saleError } = await adminClient.from("sales").insert({
            dish_id: dishId,
            location_id: typedIntegration.location_id,
            restaurant_id: typedIntegration.restaurant_id,
            quantity: quantity,
            total_price: totalPrice,
            sale_date: saleDate,
          });

          if (!saleError) salesCreated++;
        }
      }
    }

    // Update last sync time (unless test mode)
    if (!isTestMode) {
      const newSettings = { 
        ...settings, 
        last_sync_time: now.toISOString(),
        last_sync_mode: isSimulationMode ? "simulation" : "live"
      };
      await adminClient
        .from("pos_integrations")
        .update({ 
          settings: newSettings,
          last_sync_time: now.toISOString(),
        })
        .eq("id", typedIntegration.id);
    }

    // Log sync result
    await adminClient.from("pos_sync_logs").insert({
      location_id: typedIntegration.location_id,
      restaurant_id: typedIntegration.restaurant_id,
      pos_provider: "captiva",
      event_type: isSimulationMode ? "simulation_sync" : (isTestMode ? "test_sync" : "sync_completed"),
      status: "success",
      message: `${isSimulationMode ? "[SIMULATION] " : ""}Synced ${orders.length} orders, created ${salesCreated} sales, ${dishesCreated} new dishes, ${attendanceCreated} attendance records`,
      details: { 
        orders_count: orders.length, 
        sales_created: salesCreated, 
        dishes_created: dishesCreated, 
        mappings_created: mappingsCreated,
        attendance_created: attendanceCreated,
        unmapped_staff: unmappedStaff,
        test_mode: isTestMode,
        simulation_mode: isSimulationMode,
      },
    });

    console.log(`Captiva sync completed: ${orders.length} orders, ${salesCreated} sales, ${dishesCreated} dishes, ${attendanceCreated} attendance, simulation: ${isSimulationMode}`);
    if (unmappedStaff.length > 0) {
      console.log(`Unmapped staff operator codes: ${unmappedStaff.join(', ')}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: isSimulationMode 
          ? "Simulation sync completed - fake data inserted" 
          : (isTestMode ? "Test sync completed (no data written)" : "Captiva sync completed"),
        data: {
          orders_processed: orders.length,
          sales_created: isTestMode ? 0 : salesCreated,
          dishes_created: isTestMode ? 0 : dishesCreated,
          mappings_created: isTestMode ? 0 : mappingsCreated,
          attendance_created: isTestMode ? 0 : attendanceCreated,
          unmapped_staff: unmappedStaff,
          last_sync: isTestMode ? settings.last_sync_time : now.toISOString(),
          test_mode: isTestMode,
          simulation_mode: isSimulationMode,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Captiva sync error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
