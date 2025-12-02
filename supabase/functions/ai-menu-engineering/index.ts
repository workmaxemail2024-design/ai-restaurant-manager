import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DishData {
  id: string;
  name: string;
  category: string;
  sellingPrice: number;
  cost: number;
  margin: number;
  marginPercent: number;
  salesVolume: number;
  contributionProfit: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dishes } = await req.json() as { dishes: DishData[] };
    
    if (!dishes || dishes.length === 0) {
      return new Response(JSON.stringify({ 
        classifications: [], 
        insights: "No dish data provided for analysis." 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate averages for classification
    const avgMargin = dishes.reduce((sum, d) => sum + d.marginPercent, 0) / dishes.length;
    const avgVolume = dishes.reduce((sum, d) => sum + d.salesVolume, 0) / dishes.length;

    // Classify each dish
    const classifications = dishes.map(dish => {
      const highMargin = dish.marginPercent >= avgMargin;
      const highVolume = dish.salesVolume >= avgVolume;
      
      let classification: string;
      let recommendation: string;
      let action: string;
      
      if (highMargin && highVolume) {
        classification = "Star";
        recommendation = "Maintain quality and visibility. Consider slight price increase.";
        action = "promote";
      } else if (!highMargin && highVolume) {
        classification = "Plowhorse";
        recommendation = "Reduce portion size or ingredient cost. Consider premium upsells.";
        action = "optimize";
      } else if (highMargin && !highVolume) {
        classification = "Puzzle";
        recommendation = "Increase marketing. Reposition on menu. Train staff to suggest.";
        action = "market";
      } else {
        classification = "Dog";
        recommendation = "Consider removing or completely revamping the dish.";
        action = "remove";
      }

      return {
        ...dish,
        classification,
        recommendation,
        action,
        marginVsAvg: ((dish.marginPercent - avgMargin) / avgMargin * 100).toFixed(1),
        volumeVsAvg: ((dish.salesVolume - avgVolume) / avgVolume * 100).toFixed(1),
      };
    });

    // Generate AI insights
    const stars = classifications.filter(c => c.classification === "Star");
    const dogs = classifications.filter(c => c.classification === "Dog");
    const puzzles = classifications.filter(c => c.classification === "Puzzle");
    const plowhorses = classifications.filter(c => c.classification === "Plowhorse");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let aiInsights = "";

    if (LOVABLE_API_KEY) {
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
                content: "You are a restaurant menu engineering expert. Provide concise, actionable insights."
              },
              {
                role: "user",
                content: `Analyze this menu classification:
                Stars (${stars.length}): ${stars.map(s => s.name).join(", ") || "None"}
                Plowhorses (${plowhorses.length}): ${plowhorses.map(p => p.name).join(", ") || "None"}
                Puzzles (${puzzles.length}): ${puzzles.map(p => p.name).join(", ") || "None"}
                Dogs (${dogs.length}): ${dogs.map(d => d.name).join(", ") || "None"}
                
                Average margin: ${avgMargin.toFixed(1)}%
                Average volume: ${avgVolume.toFixed(0)} units
                
                Provide 3-4 specific recommendations to optimize this menu.`
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

    const summary = {
      totalDishes: dishes.length,
      stars: stars.length,
      plowhorses: plowhorses.length,
      puzzles: puzzles.length,
      dogs: dogs.length,
      avgMargin: avgMargin.toFixed(1),
      avgVolume: avgVolume.toFixed(0),
    };

    return new Response(JSON.stringify({ 
      classifications, 
      summary,
      insights: aiInsights || `Menu Analysis: ${stars.length} Stars, ${plowhorses.length} Plowhorses, ${puzzles.length} Puzzles, ${dogs.length} Dogs. Focus on promoting Stars and converting Puzzles.`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in ai-menu-engineering:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
