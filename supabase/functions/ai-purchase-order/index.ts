import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IngredientNeed {
  ingredientId: string;
  name: string;
  currentStock: number;
  unit: string;
  avgDailyUsage: number;
  daysUntilStockout: number;
  supplierId: string;
  supplierName: string;
  unitPrice: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { ingredients, suppliers, targetDays = 14, restaurant_id } = await req.json();

    // Verify user belongs to restaurant if provided
    if (restaurant_id) {
      const { data: membership } = await supabaseClient
        .from('user_restaurants')
        .select('id')
        .eq('user_id', user.id)
        .eq('restaurant_id', restaurant_id)
        .single();
      
      if (!membership) {
        return new Response(JSON.stringify({ error: "Access denied to this restaurant" }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (!ingredients || ingredients.length === 0) {
      return new Response(JSON.stringify({ 
        orders: [], 
        totalCost: 0,
        insights: "No ingredient data provided." 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate needs for each ingredient
    const needs = ingredients.map((ing: IngredientNeed) => {
      const targetStock = ing.avgDailyUsage * targetDays;
      const orderQty = Math.max(0, Math.ceil(targetStock - ing.currentStock));
      const estimatedCost = orderQty * ing.unitPrice;
      const urgency = ing.daysUntilStockout <= 3 ? "critical" : 
                      ing.daysUntilStockout <= 7 ? "high" : "normal";

      return {
        ...ing,
        orderQty,
        estimatedCost,
        urgency,
        targetStock
      };
    }).filter((n: any) => n.orderQty > 0);

    // Group by supplier
    const ordersBySupplier: Record<string, any> = {};
    needs.forEach((need: any) => {
      const supplierId = need.supplierId || "unknown";
      if (!ordersBySupplier[supplierId]) {
        ordersBySupplier[supplierId] = {
          supplierId,
          supplierName: need.supplierName || "Unknown Supplier",
          items: [],
          totalCost: 0
        };
      }
      ordersBySupplier[supplierId].items.push({
        ingredientId: need.ingredientId,
        name: need.name,
        quantity: need.orderQty,
        unit: need.unit,
        unitPrice: need.unitPrice,
        lineTotal: need.estimatedCost,
        urgency: need.urgency
      });
      ordersBySupplier[supplierId].totalCost += need.estimatedCost;
    });

    const orders = Object.values(ordersBySupplier);
    const totalCost = orders.reduce((sum: number, o: any) => sum + o.totalCost, 0);

    // Generate AI recommendations
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let aiInsights = "";

    if (LOVABLE_API_KEY && needs.length > 0) {
      try {
        const criticalItems = needs.filter((n: any) => n.urgency === "critical");
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
                content: "You are a restaurant purchasing expert. Provide concise recommendations."
              },
              {
                role: "user",
              content: `Review this purchase order:
                Total items: ${needs.length}
                Total cost: €${totalCost.toFixed(2)}
                Critical items: ${criticalItems.length}
                Suppliers: ${orders.length}
                
                Items to order: ${needs.slice(0, 10).map((n: any) => `${n.name} (${n.orderQty} ${n.unit})`).join(", ")}
                
                Provide 2-3 purchasing recommendations.`
              }
            ],
          }),
        });

        const aiData = await response.json();
        aiInsights = aiData.choices?.[0]?.message?.content || "";
      } catch (e) {
        console.error("AI insights error:", e);
      }
    }

    return new Response(JSON.stringify({ 
      orders,
      totalCost,
      itemCount: needs.length,
      summary: {
        criticalItems: needs.filter((n: any) => n.urgency === "critical").length,
        highPriorityItems: needs.filter((n: any) => n.urgency === "high").length,
        normalItems: needs.filter((n: any) => n.urgency === "normal").length,
        supplierCount: orders.length
      },
      insights: aiInsights || `Generated ${orders.length} purchase orders totaling €${totalCost.toFixed(2)} for ${needs.length} items.`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in ai-purchase-order:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
