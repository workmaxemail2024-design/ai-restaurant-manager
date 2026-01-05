import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatEUR(n: number): string {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
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

    const { dishes, restaurant_id } = await req.json();

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

    if (!dishes || dishes.length === 0) {
      return new Response(JSON.stringify({ 
        insights: "No dish cost data provided for analysis.",
        recommendations: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ 
        insights: "AI analysis unavailable. Please configure LOVABLE_API_KEY.",
        recommendations: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate averages
    const avgFoodCost = dishes.reduce((sum: number, d: any) => sum + d.foodCostPercent, 0) / dishes.length;
    const avgMargin = dishes.reduce((sum: number, d: any) => sum + d.marginPercent, 0) / dishes.length;
    const totalProfit = dishes.reduce((sum: number, d: any) => sum + d.grossProfit, 0);

    // Identify problem areas
    const highCostDishes = dishes.filter((d: any) => d.foodCostPercent > 35);
    const lowMarginDishes = dishes.filter((d: any) => d.marginPercent < 50);

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
            content: "You are a restaurant cost optimization expert. Provide actionable recommendations to improve profitability."
          },
          {
            role: "user",
            content: `Analyze these food costs:

SUMMARY:
- Total dishes: ${dishes.length}
- Average food cost: ${avgFoodCost.toFixed(1)}%
- Average margin: ${avgMargin.toFixed(1)}%
- Total gross profit: ${formatEUR(totalProfit)}

HIGH COST ITEMS (>35% food cost):
${highCostDishes.slice(0, 5).map((d: any) => `- ${d.name}: ${d.foodCostPercent.toFixed(1)}% food cost, ${formatEUR(d.cost)} cost`).join('\n') || 'None'}

LOW MARGIN ITEMS (<50% margin):
${lowMarginDishes.slice(0, 5).map((d: any) => `- ${d.name}: ${d.marginPercent.toFixed(1)}% margin, sells at ${formatEUR(d.sellingPrice)}`).join('\n') || 'None'}

Provide:
1. Overall assessment (2 sentences)
2. Top 5 specific recommendations to reduce costs or improve margins
3. Quick wins vs long-term strategies

Format as JSON: { insights: string, recommendations: string[], quickWins: string[], longTermStrategies: string[] }`
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
          insights: content,
          recommendations: [],
          quickWins: [],
          longTermStrategies: []
        };
      }
    } catch {
      parsed = {
        insights: content,
        recommendations: [],
        quickWins: [],
        longTermStrategies: []
      };
    }

    return new Response(JSON.stringify({
      ...parsed,
      summary: {
        avgFoodCost: avgFoodCost.toFixed(1),
        avgMargin: avgMargin.toFixed(1),
        totalProfit: totalProfit.toFixed(2),
        highCostCount: highCostDishes.length,
        lowMarginCount: lowMarginDishes.length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in ai-cost-analysis:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      insights: "Unable to generate AI analysis at this time.",
      recommendations: []
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
