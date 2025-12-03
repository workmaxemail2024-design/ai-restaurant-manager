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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { restaurant_id, message, history } = await req.json();

    // Fetch restaurant context data
    const [salesData, stockData, dishesData, staffData] = await Promise.all([
      supabaseClient
        .from("sales")
        .select("*, dishes(name, selling_price)")
        .eq("restaurant_id", restaurant_id)
        .order("sale_date", { ascending: false })
        .limit(50),
      supabaseClient
        .from("stock_levels")
        .select("*, ingredients(name, unit)")
        .eq("restaurant_id", restaurant_id),
      supabaseClient
        .from("dishes")
        .select("*")
        .eq("restaurant_id", restaurant_id),
      supabaseClient
        .from("staff")
        .select("*")
        .eq("restaurant_id", restaurant_id)
    ]);

    // Build context for AI
    const context = buildContext(
      salesData.data || [],
      stockData.data || [],
      dishesData.data || [],
      staffData.data || []
    );

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an intelligent AI assistant for a restaurant management system. You help restaurant owners and managers with:
- Analyzing sales data and trends
- Monitoring inventory and stock levels
- Staff scheduling and performance
- Menu optimization and pricing
- Operational recommendations

Current restaurant data context:
${context}

Be helpful, concise, and provide actionable insights. Use bullet points and formatting for clarity.
When asked about specific data, reference the context provided.
If you don't have enough data to answer accurately, say so.`
          },
          ...(history || []).map((msg: any) => ({
            role: msg.role,
            content: msg.content
          })),
          {
            role: "user",
            content: message
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);
      throw new Error("AI service error");
    }

    const aiData = await aiResponse.json();
    const assistantResponse = aiData.choices?.[0]?.message?.content || "I couldn't generate a response. Please try again.";

    return new Response(
      JSON.stringify({ response: assistantResponse }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("AI Assistant error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildContext(sales: any[], stock: any[], dishes: any[], staff: any[]): string {
  const parts: string[] = [];

  // Sales summary
  if (sales.length > 0) {
    const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total_price), 0);
    const recentSales = sales.slice(0, 10);
    parts.push(`RECENT SALES (${sales.length} records):
- Total revenue: $${totalRevenue.toFixed(2)}
- Recent items: ${recentSales.map(s => s.dishes?.name || 'Unknown').join(', ')}`);
  }

  // Stock levels
  if (stock.length > 0) {
    const lowStock = stock.filter(s => Number(s.quantity) < 10);
    parts.push(`INVENTORY (${stock.length} items):
- Low stock alerts: ${lowStock.length}
- Items needing attention: ${lowStock.map(s => `${s.ingredients?.name} (${s.quantity} ${s.ingredients?.unit})`).join(', ') || 'None'}`);
  }

  // Menu items
  if (dishes.length > 0) {
    parts.push(`MENU (${dishes.length} dishes):
- Items: ${dishes.map(d => `${d.name} ($${d.selling_price})`).join(', ')}`);
  }

  // Staff
  if (staff.length > 0) {
    const activeStaff = staff.filter(s => s.status === 'active');
    parts.push(`STAFF (${staff.length} total, ${activeStaff.length} active):
- Roles: ${[...new Set(staff.map(s => s.role))].join(', ')}`);
  }

  return parts.join('\n\n') || 'No data available for this restaurant.';
}
