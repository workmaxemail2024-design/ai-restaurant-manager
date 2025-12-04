import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-captiva-signature",
};

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

  try {
    const signature = req.headers.get("x-captiva-signature");
    const contentType = req.headers.get("content-type") || "";
    const rawBody = await req.text();

    console.log("Received Captiva webhook:", rawBody.substring(0, 500));

    // Parse payload
    let payload: Record<string, unknown>;
    if (contentType.includes("xml")) {
      payload = parseXmlToJson(rawBody);
    } else {
      payload = JSON.parse(rawBody);
    }

    // Extract event type and store info
    const eventType = (payload.event || payload.event_type || payload.type || "unknown") as string;
    const storeId = (payload.store_id || payload.outlet_id || payload.location_id || "") as string;

    console.log(`Processing Captiva webhook: ${eventType} for store ${storeId}`);

    // Find the integration for this store
    const { data: integrations } = await adminClient
      .from("pos_integrations")
      .select("id, location_id, restaurant_id, api_secret, settings")
      .eq("pos_provider", "captiva")
      .eq("status", "active");

    // Match by store_id in settings
    const integration = (integrations as Integration[] | null)?.find(int => {
      const settings = int.settings || {};
      return settings.store_id === storeId || !storeId;
    });

    if (!integration) {
      console.warn("No matching Captiva integration found for store:", storeId);
      return new Response(
        JSON.stringify({ success: true, message: "Webhook received, no matching integration" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify signature if secret is available (skip for demo)
    if (integration.api_secret && signature) {
      console.log("Signature verification skipped (demo mode)");
    }

    // Process different event types
    switch (eventType.toLowerCase()) {
      case "new_order":
      case "order_created":
      case "order.created": {
        const order = (payload.order || payload.data || payload) as Record<string, unknown>;
        await processOrder(adminClient, integration, order);
        break;
      }

      case "order_updated":
      case "order.updated": {
        const order = (payload.order || payload.data || payload) as Record<string, unknown>;
        await processOrder(adminClient, integration, order);
        break;
      }

      case "payment":
      case "payment_received":
      case "payment.created": {
        const payment = (payload.payment || payload.data || payload) as Record<string, unknown>;
        await processPayment(adminClient, integration, payment);
        break;
      }

      case "refund":
      case "refund_created":
      case "refund.created": {
        const refund = (payload.refund || payload.data || payload) as Record<string, unknown>;
        await processRefund(adminClient, integration, refund);
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
      event_type: `webhook_${eventType}`,
      status: "success",
      message: `Processed webhook event: ${eventType}`,
      details: { event_type: eventType, store_id: storeId },
    });

    return new Response(
      JSON.stringify({ success: true, message: `Processed ${eventType} event` }),
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
async function processOrder(adminClient: SupabaseClient<any>, integration: Integration, order: Record<string, unknown>) {
  const orderId = (order.id || order.order_id || order.order_number || `webhook-${Date.now()}`) as string;
  const orderDate = (order.date || order.timestamp || order.created_at || new Date().toISOString()) as string;
  // deno-lint-ignore no-explicit-any
  const items: any[] = Array.isArray(order.items) ? order.items : (order.items ? [order.items] : []);

  console.log(`Processing order ${orderId} with ${items.length} items`);

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
          name: `[Captiva] ${itemName}`,
          captiva_external_id: externalId,
          restaurant_id: integration.restaurant_id,
          location_id: integration.location_id,
          selling_price: price,
          category: "Imported from POS",
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
        data: { order_id: orderId, item, order_date: orderDate, source: "webhook" },
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
async function processPayment(adminClient: SupabaseClient<any>, integration: Integration, payment: Record<string, unknown>) {
  console.log("Processing payment:", payment);
  
  await adminClient.from("pos_sync_logs").insert({
    location_id: integration.location_id,
    restaurant_id: integration.restaurant_id,
    pos_provider: "captiva",
    event_type: "payment_received",
    status: "success",
    message: `Payment received: ${payment.amount || 'unknown amount'}`,
    details: payment,
  });
}

// deno-lint-ignore no-explicit-any
async function processRefund(adminClient: SupabaseClient<any>, integration: Integration, refund: Record<string, unknown>) {
  console.log("Processing refund:", refund);
  
  await adminClient.from("pos_sync_logs").insert({
    location_id: integration.location_id,
    restaurant_id: integration.restaurant_id,
    pos_provider: "captiva",
    event_type: "refund_processed",
    status: "success",
    message: `Refund processed: ${refund.amount || 'unknown amount'}`,
    details: refund,
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
