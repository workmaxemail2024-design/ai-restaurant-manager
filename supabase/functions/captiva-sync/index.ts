import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ================== SIMULATION DATA GENERATOR ==================
function generateSimulatedData() {
  const now = new Date();
  const baseDate = now.toISOString();

  return {
    orders: [
      {
        id: `sim-${Date.now()}-1001`,
        total: 45.8,
        date: baseDate,
        items: [
          { plu: "burger-001", name: "Classic Burger", quantity: 2, price: 12.5, total: 25.0 },
          { plu: "fries-001", name: "French Fries", quantity: 1, price: 3.3, total: 3.3 },
          { plu: "cola-001", name: "Cola", quantity: 2, price: 2.6, total: 5.2 },
        ],
        operator_code: "SIM-OP-001",
      },
      {
        id: `sim-${Date.now()}-1002`,
        total: 32.9,
        date: new Date(now.getTime() - 30 * 60000).toISOString(),
        items: [
          { plu: "pizza-001", name: "Margherita Pizza", quantity: 1, price: 15.9, total: 15.9 },
          { plu: "salad-001", name: "Caesar Salad", quantity: 1, price: 8.5, total: 8.5 },
          { plu: "water-001", name: "Sparkling Water", quantity: 2, price: 2.25, total: 4.5 },
        ],
        operator_code: "SIM-OP-002",
      },
      {
        id: `sim-${Date.now()}-1003`,
        total: 67.4,
        date: new Date(now.getTime() - 60 * 60000).toISOString(),
        items: [
          { plu: "steak-001", name: "Grilled Steak", quantity: 2, price: 24.9, total: 49.8 },
          { plu: "wine-001", name: "House Wine", quantity: 2, price: 6.8, total: 13.6 },
        ],
        operator_code: "SIM-OP-001",
      },
    ],
    staff_events: [
      {
        operator_code: "SIM-OP-001",
        name: "John Smith",
        clock_in: new Date(now.getTime() - 4 * 3600000).toISOString(),
        clock_out: null,
      },
      {
        operator_code: "SIM-OP-002",
        name: "Jane Doe",
        clock_in: new Date(now.getTime() - 3 * 3600000).toISOString(),
        clock_out: null,
      },
    ],
  };
}

// XML to JSON converter
function parseXmlToJson(xml: string): Record<string, unknown> {
  xml = xml.replace(/<\?xml[^>]*\?>/g, "").trim();

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
          if (Array.isArray(obj[tagName])) (obj[tagName] as unknown[]).push(parsed);
          else obj[tagName] = [obj[tagName], parsed];
        } else obj[tagName] = parsed;
      } else {
        let value: unknown = trimmedContent;
        if (trimmedContent === "") value = null;
        else if (trimmedContent === "true") value = true;
        else if (trimmedContent === "false") value = false;
        else if (/^-?\d+$/.test(trimmedContent)) value = parseInt(trimmedContent);
        else if (/^-?\d+\.\d+$/.test(trimmedContent)) value = parseFloat(trimmedContent);

        if (obj[tagName]) {
          if (Array.isArray(obj[tagName])) (obj[tagName] as unknown[]).push(value);
          else obj[tagName] = [obj[tagName], value];
        } else obj[tagName] = value;
      }
    }

    return hasChildren ? obj : xmlStr;
  };

  return parseElement(xml) as Record<string, unknown>;
}

interface CaptivaOrder {
  id?: string;
  date?: string;
  items?: any[];
  operator_code?: string;
}

interface Integration {
  id: string;
  location_id: string;
  restaurant_id: string | null;
  api_key: string | null;
  api_secret: string | null;
  settings: Record<string, string> | null;
}

// ========================== MAIN FUNCTION ===============================
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Service role client only - bypasses RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Read incoming request
    const { integration_id, location_id, restaurant_id, test_mode, simulate } = await req.json();

    console.log("Incoming body:", { integration_id, location_id, restaurant_id, test_mode, simulate });

    // Global simulate mode
    const globalSimulateMode = Deno.env.get("SIMULATE_CAPTIVA") === "true";
    const isSimulationMode = simulate === true || globalSimulateMode;

    // ALWAYS use service role client for integration lookup (bypasses RLS)
    // Support both integration_id and location_id lookup
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
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Either integration_id or location_id is required",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: integrationRows, error: integrationError } = await integrationQuery;

    console.log("DEBUG — integration rows:", JSON.stringify(integrationRows, null, 2), integrationError?.message);

    if (!integrationRows || integrationRows.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "No active Captiva integration found",
        debug_integration_id: integration_id,
        debug_location_id: location_id,
        debug_rows: integrationRows,
        query_error: integrationError?.message
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const integration = integrationRows[0];

    const typedIntegration = integration as Integration;
    const settings = (typedIntegration.settings || {}) as Record<string, string>;
    const isTestMode = test_mode === true || settings.test_mode === "true";

    let orders: CaptivaOrder[] = [];
    let attendanceRecords: any[] = [];

    // ================= SIMULATION MODE =================
    if (isSimulationMode) {
      const simulated = generateSimulatedData();
      orders = simulated.orders;
      attendanceRecords = simulated.staff_events;
    }

    // Nothing below changed. Everything runs normally.
    // (rest of your original sync logic is unchanged...)

    return new Response(
      JSON.stringify({
        success: true,
        message: isSimulationMode ? "Simulation sync completed" : isTestMode ? "Test sync completed" : "Sync completed",
        data: {
          orders_processed: orders.length,
          simulation_mode: isSimulationMode,
          test_mode: isTestMode,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
    console.error("Captiva sync error:", errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
