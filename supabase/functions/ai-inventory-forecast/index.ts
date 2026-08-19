import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IngredientUsage {
  ingredientId: string;
  name: string;
  currentStock: number;
  unit: string;
  avgDailyUsage: number;
  recentUsage: number[];
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

    const { ingredients, salesData, forecastDays = 14, restaurant_id } = await req.json();

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
        forecasts: [], 
        alerts: [],
        insights: "No ingredient data provided." 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only ingredients with genuine measured usage can be forecast.
    const forecastable = ingredients.filter(
      (ing: IngredientUsage) => Number(ing.avgDailyUsage) > 0,
    );

    const forecasts = forecastable.map((ing: IngredientUsage) => {
      const avgUsage = Number(ing.avgDailyUsage);
      const daysUntilStockout = ing.currentStock / avgUsage;
      
      // Calculate trend (increasing/decreasing usage)
      const recentAvg = ing.recentUsage?.slice(-7).reduce((a, b) => a + b, 0) / 7 || avgUsage;
      const trend = recentAvg > avgUsage ? "increasing" : recentAvg < avgUsage ? "decreasing" : "stable";
      
      // Forecast for different periods
      const forecast7 = Math.max(0, ing.currentStock - (avgUsage * 7));
      const forecast14 = Math.max(0, ing.currentStock - (avgUsage * 14));
      const forecast30 = Math.max(0, ing.currentStock - (avgUsage * 30));

      // Recommended reorder quantity (2 weeks buffer)
      const reorderQty = Math.ceil(avgUsage * 14);
      const reorderDate = daysUntilStockout <= 7 
        ? new Date(Date.now() + (daysUntilStockout * 0.5 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0]
        : null;

      // Detect anomalies (shrinkage/waste)
      const expectedUsage = avgUsage * 7;
      const actualUsage = ing.recentUsage?.slice(-7).reduce((a, b) => a + b, 0) || expectedUsage;
      const variance = ((actualUsage - expectedUsage) / expectedUsage) * 100;
      // Anomalies need real recent-usage samples, never inferred from a flat average.
      const hasSamples = (ing.recentUsage?.length || 0) >= 7;
      const anomaly = hasSamples && Math.abs(variance) > 20;

      return {
        ingredientId: ing.ingredientId,
        name: ing.name,
        currentStock: ing.currentStock,
        unit: ing.unit,
        avgDailyUsage: avgUsage.toFixed(2),
        daysUntilStockout: Math.floor(daysUntilStockout),
        forecast7,
        forecast14,
        forecast30,
        trend,
        reorderQty,
        reorderDate,
        anomaly,
        variance: variance.toFixed(1),
        riskLevel: daysUntilStockout <= 3 ? "critical" : daysUntilStockout <= 7 ? "warning" : "normal"
      };
    });

    // Generate alerts
    const alerts = [];
    const criticalItems = forecasts.filter((f: any) => f.riskLevel === "critical");
    const warningItems = forecasts.filter((f: any) => f.riskLevel === "warning");
    const anomalies = forecasts.filter((f: any) => f.anomaly);

    if (criticalItems.length > 0) {
      alerts.push({
        type: "critical",
        title: "Stock-out Imminent",
        message: `${criticalItems.length} items will run out within 3 days: ${criticalItems.map((i: any) => i.name).join(", ")}`,
        items: criticalItems.map((i: any) => i.name)
      });
    }

    if (warningItems.length > 0) {
      alerts.push({
        type: "warning",
        title: "Low Stock Warning",
        message: `${warningItems.length} items need reordering soon`,
        items: warningItems.map((i: any) => i.name)
      });
    }

    if (anomalies.length > 0) {
      alerts.push({
        type: "anomaly",
        title: "Suspicious Usage Detected",
        message: `${anomalies.length} items show unusual consumption patterns (possible waste/shrinkage)`,
        items: anomalies.map((a: any) => `${a.name} (${a.variance}% variance)`)
      });
    }

    // Generate AI insights
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let aiInsights = "";

    if (LOVABLE_API_KEY && forecasts.length > 0) {
      try {
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
                content: "You are an inventory management expert for restaurants. Provide concise, actionable insights."
              },
              {
                role: "user",
                content: `Analyze this inventory forecast:
                Critical (stock-out in 3 days): ${criticalItems.length} items
                Warning (stock-out in 7 days): ${warningItems.length} items  
                Anomalies detected: ${anomalies.length} items
                
                Top concerns: ${criticalItems.slice(0, 5).map((i: any) => `${i.name} (${i.daysUntilStockout} days left)`).join(", ") || "None"}
                
                Provide 3 specific recommendations.`
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
      forecasts,
      alerts,
      summary: {
        totalIngredients: forecasts.length,
        criticalCount: criticalItems.length,
        warningCount: warningItems.length,
        anomalyCount: anomalies.length,
      },
      insights: aiInsights || "Review critical items immediately and place orders for items with less than 7 days of stock."
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in ai-inventory-forecast:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
