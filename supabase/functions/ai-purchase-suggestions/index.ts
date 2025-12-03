import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { restaurant_id, ingredients } = await req.json();

    // Fetch supplier data
    const { data: suppliers } = await supabaseClient
      .from('suppliers')
      .select('*')
      .eq('restaurant_id', restaurant_id);

    // Fetch recent purchase orders
    const { data: recentOrders } = await supabaseClient
      .from('purchase_orders')
      .select('*, purchase_order_items(*)')
      .eq('restaurant_id', restaurant_id)
      .order('order_date', { ascending: false })
      .limit(20);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Calculate low stock items
    const lowStockItems = (ingredients || []).filter((ing: any) => 
      ing.currentStock < (ing.avgDailyUsage * 3)
    );

    const criticalItems = (ingredients || []).filter((ing: any) => 
      ing.currentStock < ing.avgDailyUsage
    );
    
    if (!LOVABLE_API_KEY) {
      const recommendations = [
        ...criticalItems.map((i: any) => `URGENT: Order ${i.name} immediately - less than 1 day supply`),
        ...lowStockItems.filter((i: any) => !criticalItems.includes(i)).map((i: any) => 
          `Order ${i.name} within 2-3 days - running low`
        ),
      ];
      
      return new Response(JSON.stringify({
        recommendations: recommendations.length ? recommendations : ['All stock levels are healthy'],
        items: lowStockItems.map((i: any) => i.name),
        urgentCount: criticalItems.length,
        lowStockCount: lowStockItems.length,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: "You are a restaurant purchasing manager AI. Provide specific, cost-effective purchasing recommendations."
          },
          {
            role: "user",
            content: `Generate smart purchasing suggestions:

INVENTORY STATUS:
${(ingredients || []).map((i: any) => 
  `- ${i.name}: ${i.currentStock} ${i.unit} (daily use: ~${i.avgDailyUsage} ${i.unit})`
).join('\n') || 'No inventory data'}

CRITICAL (< 1 day supply):
${criticalItems.map((i: any) => `- ${i.name}`).join('\n') || 'None'}

LOW STOCK (< 3 days supply):
${lowStockItems.map((i: any) => `- ${i.name}`).join('\n') || 'None'}

SUPPLIERS:
${suppliers?.map((s: any) => `- ${s.name} (${s.email})`).join('\n') || 'No supplier data'}

RECENT ORDER PATTERNS:
${recentOrders?.slice(0, 5).map((o: any) => 
  `- ${new Date(o.order_date).toLocaleDateString()}: ${o.purchase_order_items?.length || 0} items`
).join('\n') || 'No recent orders'}

Provide:
1. Immediate purchase recommendations (priority items)
2. Suggested order quantities based on usage patterns
3. Supplier recommendations for each item if possible
4. Cost-saving opportunities (bulk orders, timing)
5. Any items to avoid over-ordering

Format as JSON with keys: recommendations (array of strings), urgentItems (array), suggestedOrders (array with name, quantity, priority), costSavingTips (array)`
          }
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    
    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = {
          recommendations: [content],
          urgentItems: criticalItems.map((i: any) => i.name),
          suggestedOrders: [],
          costSavingTips: []
        };
      }
    } catch {
      parsed = {
        recommendations: [content],
        urgentItems: criticalItems.map((i: any) => i.name),
        suggestedOrders: [],
        costSavingTips: []
      };
    }

    console.log('Purchase suggestions generated successfully');
    
    return new Response(JSON.stringify({
      ...parsed,
      urgentCount: criticalItems.length,
      lowStockCount: lowStockItems.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in ai-purchase-suggestions:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      recommendations: ["Unable to generate purchase suggestions at this time."],
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
