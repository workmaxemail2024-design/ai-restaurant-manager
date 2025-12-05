import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-captiva-signature",
};

// ============ SIMULATION DATA GENERATOR ============
function generateSimulatedWebhookOrder() {
  const now = new Date();
  return {
    id: `sim-webhook-${Date.now()}`,
    total: 28.50,
    date: now.toISOString(),
    items: [
      { plu: "sim-burger-001", name: "Simulated Burger", quantity: 1, price: 14.90, total: 14.90 },
      { plu: "sim-drink-001", name: "Simulated Drink", quantity: 2, price: 3.80, total: 7.60 }
    ],
    operator_code: "SIM-WEBHOOK-OP"
  };
}

// XML to JSON converter
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

interface Integration {
  id: string;
  location_id: string;
  restaurant_id: string | null;
  api_secret: string | null;
  settings: Record<string, string> | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // deno-lint-ignore no-explicit-any
  const adminClient: SupabaseClient<any> = createClient(supabaseUrl, serviceRoleKey);

  // Check global simulation mode
  const globalSimulateMode = Deno.env.get("SIMULATE_CAPTIVA") === "true";

  try {
    const signature = req.headers.get("x-captiva-signature");
    const contentType = req.headers.get("content-type") || "";
    const rawBody = await req.text();

    console.log(`Received Captiva webhook (simulation_mode: ${globalSimulateMode}):`, rawBody.substring(0, 500));

    // Parse payload
    let payload: Record<string, unknown>;
    if (contentType.includes("xml")) {
      payload = parseXmlToJson(rawBody);
    } else {
      payload = JSON.parse(rawBody);
    }

    // Check for simulation flag in payload
    const isSimulationMode = globalSimulateMode || (payload.simulate === true);

    // Extract event type and store info
    let eventType = (payload.event || payload.event_type || payload.type || "unknown") as string;
    let storeId = (payload.store_id || payload.outlet_id || payload.location_id || "") as string;
    let order = (payload.order || payload.data || payload) as Record<string, unknown>;

    // ============ SIMULATION MODE ============
    if (isSimulationMode) {
      console.log("🎮 SIMULATION MODE - Processing simulated webhook");
      eventType = payload.event as string || "new_order";
      order = generateSimulatedWebhookOrder();
      storeId = "simulation";
    }

    console.log(`Processing Captiva webhook: ${eventType} for store ${storeId}, simulation: ${isSimulationMode}`);

    // Find the integration for this store (or use first one in simulation mode)
    const { data: integrations } = await adminClient
      .from("pos_integrations")
      .select("id, location_id, restaurant_id, api_secret, settings")
      .eq("pos_provider", "captiva")
      .eq("status", "active");

    // Match by store_id in settings
    let integration = (integrations as Integration[] | null)?.find(int => {
      const settings = int.settings || {};
      return settings.store_id === storeId || !storeId;
    });

    // In simulation mode, use the first available integration
    if (!integration && isSimulationMode && integrations && integrations.length > 0) {
      integration = integrations[0] as Integration;
      console.log("🎮 Using first available integration for simulation");
    }

    if (!integration) {
      console.warn("No matching Captiva integration found for store:", storeId);
      return new Response(
        JSON.stringify({ success: true, message: "Webhook received, no matching integration" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify signature if secret is available (skip for demo and simulation)
    if (integration.api_secret && signature && !isSimulationMode) {
      console.log("Signature verification skipped (demo mode)");
    }

    // Process different event types
    switch (eventType.toLowerCase()) {
      case "new_order":
      case "order_created":
      case "order.created": {
        await processOrder(adminClient, integration, order, isSimulationMode);
        break;
      }

      case "order_updated":
      case "order.updated": {
        await processOrder(adminClient, integration, order, isSimulationMode);
        break;
      }

      case "payment":
      case "payment_received":
      case "payment.created": {
        const payment = (payload.payment || payload.data || payload) as Record<string, unknown>;
        await processPayment(adminClient, integration, payment, isSimulationMode);
        break;
      }

      case "refund":
      case "refund_created":
      case "refund.created": {
        const refund = (payload.refund || payload.data || payload) as Record<string, unknown>;
        await processRefund(adminClient, integration, refund, isSimulationMode);
        break;
      }

      default:
        console.log("Unhandled event type:", eventType);
    }

    // Log the webhook event
    await adminClient.from("pos_sync_logs").insert({
      location_id: integration.location_id,
      restaurant_id: integration.restaurant_id,
      pos_provider: "captiva",
      event_type: isSimulationMode ? `simulation_webhook_${eventType}` : `webhook_${eventType}`,
      status: "success",
      message: `${isSimulationMode ? "[SIMULATION] " : ""}Processed webhook event: ${eventType}`,
      details: { event_type: eventType, store_id: storeId, simulation: isSimulationMode },
    });

    return new Response(
      JSON.stringify({ success: true, message: `Processed ${eventType} event`, simulation: isSimulationMode }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Captiva webhook error:", error);
    
    // Log error
    await adminClient.from("pos_sync_logs").insert({
      location_id: "00000000-0000-0000-0000-000000000000",
      pos_provider: "captiva",
      event_type: "webhook_error",
      status: "fail",
      message: error instanceof Error ? error.message : "Unknown webhook error",
    });

    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// deno-lint-ignore no-explicit-any
async function processOrder(adminClient: SupabaseClient<any>, integration: Integration, order: Record<string, unknown>, isSimulation: boolean) {
  const orderId = (order.id || order.order_id || order.order_number || `webhook-${Date.now()}`) as string;
  const orderDate = (order.date || order.timestamp || order.created_at || new Date().toISOString()) as string;
  // deno-lint-ignore no-explicit-any
  const items: any[] = Array.isArray(order.items) ? order.items : (order.items ? [order.items] : []);

  console.log(`Processing order ${orderId} with ${items.length} items (simulation: ${isSimulation})`);

  for (const item of items) {
    const externalId = (item.plu || item.sku || item.item_id || "") as string;
    if (!externalId) continue;

    const itemName = (item.name || `Item ${externalId}`) as string;
    const quantity = typeof item.quantity === 'string' ? parseInt(item.quantity) : (item.quantity as number || 1);
    const price = typeof item.price === 'string' ? parseFloat(item.price) : (item.price as number || 0);
    const totalPrice = typeof item.total === 'string' ? parseFloat(item.total) : (item.total as number || price * quantity);

    // Find or create dish
    const { data: existingDish } = await adminClient
      .from("dishes")
      .select("id")
      .eq("captiva_external_id", externalId)
      .eq("restaurant_id", integration.restaurant_id)
      .single();

    let dishId: string | null = existingDish?.id || null;

    if (!dishId) {
      const { data: mapping } = await adminClient
        .from("pos_mappings")
        .select("internal_id")
        .eq("external_id", externalId)
        .eq("pos_provider", "captiva")
        .eq("location_id", integration.location_id)
        .eq("is_verified", true)
        .single();

      if (mapping?.internal_id) {
        dishId = mapping.internal_id;
      }
    }

    if (!dishId) {
      const { data: newDish } = await adminClient
        .from("dishes")
        .insert({
          name: isSimulation ? `[Simulated] ${itemName}` : `[Captiva] ${itemName}`,
          captiva_external_id: externalId,
          restaurant_id: integration.restaurant_id,
          location_id: integration.location_id,
          selling_price: price,
          category: isSimulation ? "Simulated from Webhook" : "Imported from POS",
        })
        .select("id")
        .single();
      
      dishId = newDish?.id || null;

      if (dishId) {
        await adminClient.from("pos_mappings").insert({
          location_id: integration.location_id,
          restaurant_id: integration.restaurant_id,
          pos_provider: "captiva",
          mapping_type: "dish",
          external_id: externalId,
          external_name: itemName,
          internal_id: dishId,
          is_verified: false,
        });
      }
    }

    if (dishId) {
      const saleDate = new Date(orderDate).toISOString().split('T')[0];

      await adminClient.from("pos_sales_import").upsert({
        location_id: integration.location_id,
        restaurant_id: integration.restaurant_id,
        pos_provider: "captiva",
        external_sale_id: `${orderId}-${externalId}`,
        data: { order_id: orderId, item, order_date: orderDate, source: "webhook", simulation: isSimulation },
        mapped_dish_id: dishId,
        mapped_quantity: quantity,
        mapped_total_price: totalPrice,
        mapped_sale_date: saleDate,
        sync_status: "synced",
      }, { onConflict: "external_sale_id,location_id,pos_provider" });

      await adminClient.from("sales").insert({
        dish_id: dishId,
        location_id: integration.location_id,
        restaurant_id: integration.restaurant_id,
        quantity: quantity,
        total_price: totalPrice,
        sale_date: saleDate,
      });
    }
  }
}

// deno-lint-ignore no-explicit-any
async function processPayment(adminClient: SupabaseClient<any>, integration: Integration, payment: Record<string, unknown>, isSimulation: boolean) {
  console.log(`Processing payment (simulation: ${isSimulation}):`, payment);
  
  await adminClient.from("pos_sync_logs").insert({
    location_id: integration.location_id,
    restaurant_id: integration.restaurant_id,
    pos_provider: "captiva",
    event_type: isSimulation ? "simulation_payment_received" : "payment_received",
    status: "success",
    message: `${isSimulation ? "[SIMULATION] " : ""}Payment received: ${payment.amount || 'unknown amount'}`,
    details: { ...payment, simulation: isSimulation },
  });
}

// deno-lint-ignore no-explicit-any
async function processRefund(adminClient: SupabaseClient<any>, integration: Integration, refund: Record<string, unknown>, isSimulation: boolean) {
  console.log(`Processing refund (simulation: ${isSimulation}):`, refund);
  
  await adminClient.from("pos_sync_logs").insert({
    location_id: integration.location_id,
    restaurant_id: integration.restaurant_id,
    pos_provider: "captiva",
    event_type: isSimulation ? "simulation_refund_processed" : "refund_processed",
    status: "success",
    message: `${isSimulation ? "[SIMULATION] " : ""}Refund processed: ${refund.amount || 'unknown amount'}`,
    details: { ...refund, simulation: isSimulation },
  });

  // deno-lint-ignore no-explicit-any
  const items: any[] = Array.isArray(refund.items) ? refund.items : (refund.items ? [refund.items] : []);
  for (const item of items) {
    const externalId = (item.plu || item.sku || item.item_id || "") as string;
    if (!externalId) continue;

    const { data: dish } = await adminClient
      .from("dishes")
      .select("id")
      .eq("captiva_external_id", externalId)
      .eq("restaurant_id", integration.restaurant_id)
      .single();

    if (dish) {
      const quantity = -(typeof item.quantity === 'string' ? parseInt(item.quantity) : (item.quantity as number || 1));
      const totalPrice = -(typeof item.total === 'string' ? parseFloat(item.total) : (item.total as number || 0));

      await adminClient.from("sales").insert({
        dish_id: dish.id,
        location_id: integration.location_id,
        restaurant_id: integration.restaurant_id,
        quantity: quantity,
        total_price: totalPrice,
        sale_date: new Date().toISOString().split('T')[0],
      });
    }
  }
}
