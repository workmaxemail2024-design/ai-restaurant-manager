import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// XML to JSON converter for Captiva responses
function parseXmlToJson(xml: string): Record<string, unknown> {
  // Remove XML declaration
  xml = xml.replace(/<\?xml[^>]*\?>/g, '').trim();
  
  // Parse elements
  const parseElement = (xmlStr: string): Record<string, unknown> | string => {
    const obj: Record<string, unknown> = {};
    
    // Match tags and content
    const tagRegex = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>/g;
    let match;
    let hasChildren = false;
    
    while ((match = tagRegex.exec(xmlStr)) !== null) {
      hasChildren = true;
      const [, tagName, , content] = match;
      const trimmedContent = content.trim();
      
      // Check if content has nested tags
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
        // Leaf node - convert to appropriate type
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

    const { integration_id, location_id } = await req.json();

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

    if (!baseUrl || !apiKey || !apiSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing Captiva credentials in integration settings" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Starting Captiva sync for location ${typedIntegration.location_id}, store ${storeId || 'default'}`);

    const authString = btoa(`${apiKey}:${apiSecret}`);
    const lastSync = settings.last_sync_time ? new Date(settings.last_sync_time) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const now = new Date();

    // Format dates for Captiva API (typically ISO or YYYY-MM-DD)
    const fromDate = lastSync.toISOString();
    const toDate = now.toISOString();

    // Fetch orders from Captiva
    const ordersEndpoint = storeId
      ? `${baseUrl.replace(/\/$/, '')}/api/v1/stores/${storeId}/orders`
      : `${baseUrl.replace(/\/$/, '')}/api/v1/orders`;

    const ordersUrl = `${ordersEndpoint}?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`;
    
    console.log(`Fetching orders from: ${ordersUrl}`);

    const ordersResponse = await fetch(ordersUrl, {
      headers: {
        "Authorization": `Basic ${authString}`,
        "Accept": "application/json, application/xml",
      },
    });

    if (!ordersResponse.ok) {
      const errorText = await ordersResponse.text();
      console.error("Captiva orders error:", errorText);
      
      // Log sync failure
      await adminClient.from("pos_sync_logs").insert({
        location_id: typedIntegration.location_id,
        restaurant_id: typedIntegration.restaurant_id,
        pos_provider: "captiva",
        event_type: "sync_failed",
        status: "fail",
        message: `Failed to fetch orders: ${ordersResponse.status}`,
        details: { error: errorText.substring(0, 500) },
      });

      return new Response(
        JSON.stringify({ success: false, error: `Captiva API error: ${ordersResponse.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = ordersResponse.headers.get("content-type") || "";
    let ordersData: Record<string, unknown>;

    if (contentType.includes("xml")) {
      const xmlText = await ordersResponse.text();
      ordersData = parseXmlToJson(xmlText);
      console.log("Parsed XML response to JSON");
    } else {
      ordersData = await ordersResponse.json();
    }

    // Extract orders array
    const orders: CaptivaOrder[] = Array.isArray(ordersData.orders) 
      ? ordersData.orders as CaptivaOrder[]
      : (ordersData.order ? [ordersData.order as CaptivaOrder] : []);

    console.log(`Processing ${orders.length} orders`);

    let salesCreated = 0;
    let dishesCreated = 0;
    let mappingsCreated = 0;

    for (const order of orders) {
      const orderId = order.id || order.order_id || order.order_number || `unknown-${Date.now()}`;
      const orderDate = order.date || order.timestamp || new Date().toISOString();
      const items: CaptivaOrderItem[] = Array.isArray(order.items) ? order.items : (order.items ? [order.items] : []);

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

        // Create placeholder dish if not found
        if (!dishId) {
          const { data: newDish, error: dishError } = await adminClient
            .from("dishes")
            .insert({
              name: `[Captiva] ${itemName}`,
              captiva_external_id: externalId,
              restaurant_id: typedIntegration.restaurant_id,
              location_id: typedIntegration.location_id,
              selling_price: price,
              category: "Imported from POS",
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

        if (dishId) {
          // Check if sale already exists (avoid duplicates)
          const saleDate = new Date(orderDate).toISOString().split('T')[0];
          
          // Import to pos_sales_import for tracking
          await adminClient.from("pos_sales_import").insert({
            location_id: typedIntegration.location_id,
            restaurant_id: typedIntegration.restaurant_id,
            pos_provider: "captiva",
            external_sale_id: `${orderId}-${externalId}`,
            data: { order_id: orderId, item, order_date: orderDate },
            mapped_dish_id: dishId,
            mapped_quantity: quantity,
            mapped_total_price: totalPrice,
            mapped_sale_date: saleDate,
            sync_status: "synced",
          });

          // Insert into sales table
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

    // Update last sync time
    const newSettings = { ...settings, last_sync_time: now.toISOString() };
    await adminClient
      .from("pos_integrations")
      .update({ 
        settings: newSettings,
        last_sync_time: now.toISOString(),
      })
      .eq("id", typedIntegration.id);

    // Log successful sync
    await adminClient.from("pos_sync_logs").insert({
      location_id: typedIntegration.location_id,
      restaurant_id: typedIntegration.restaurant_id,
      pos_provider: "captiva",
      event_type: "sync_completed",
      status: "success",
      message: `Synced ${orders.length} orders, created ${salesCreated} sales, ${dishesCreated} new dishes`,
      details: { orders_count: orders.length, sales_created: salesCreated, dishes_created: dishesCreated, mappings_created: mappingsCreated },
    });

    console.log(`Captiva sync completed: ${orders.length} orders, ${salesCreated} sales, ${dishesCreated} dishes`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Captiva sync completed",
        data: {
          orders_processed: orders.length,
          sales_created: salesCreated,
          dishes_created: dishesCreated,
          mappings_created: mappingsCreated,
          last_sync: now.toISOString(),
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
