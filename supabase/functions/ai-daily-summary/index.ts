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

    const { 
      revenue, 
      foodCost, 
      profitMargin, 
      topDishes, 
      bottomDishes, 
      stockAlerts,
      staffMetrics,
      locationData,
      restaurant_id
    } = await req.json();

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ 
        summary: "AI summary unavailable. Please configure LOVABLE_API_KEY.",
        recommendations: []
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
            content: "You are a restaurant operations analyst. Provide a concise daily briefing with actionable insights."
          },
          {
            role: "user",
            content: `Generate a daily operations summary:

YESTERDAY'S METRICS:
- Revenue: $${revenue?.toFixed(2) || 0}
- Food Cost %: ${foodCost?.toFixed(1) || 0}%
- Profit Margin: ${profitMargin?.toFixed(1) || 0}%

TOP PERFORMERS:
${topDishes?.map((d: any) => `- ${d.name}: ${d.quantity} sold, $${d.revenue?.toFixed(2) || 0}`).join('\n') || 'No data'}

UNDERPERFORMERS:
${bottomDishes?.map((d: any) => `- ${d.name}: ${d.quantity} sold`).join('\n') || 'No data'}

STOCK ALERTS:
${stockAlerts?.map((a: any) => `- ${a.name}: ${a.quantity} ${a.unit} remaining`).join('\n') || 'None'}

STAFF:
${staffMetrics ? `- Average efficiency: ${staffMetrics.avgEfficiency}%` : 'No data'}

Provide:
1. A brief summary (2-3 sentences)
2. 3-4 specific action items for today
3. Key things to monitor

Format as JSON with keys: summary, recommendations (array of strings), watchItems (array of strings)`
          }
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    
    // Try to parse as JSON, fallback to text
    let parsed;
    try {
      // Extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = {
          summary: content,
          recommendations: [],
          watchItems: []
        };
      }
    } catch {
      parsed = {
        summary: content,
        recommendations: [],
        watchItems: []
      };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in ai-daily-summary:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      summary: "Unable to generate AI summary at this time.",
      recommendations: []
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
