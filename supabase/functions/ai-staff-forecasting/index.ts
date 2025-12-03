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

    const { restaurant_id, forecastDays = 7 } = await req.json();

    // Fetch staff and shift data
    const { data: staff } = await supabaseClient
      .from('staff')
      .select('*')
      .eq('restaurant_id', restaurant_id);

    const { data: shifts } = await supabaseClient
      .from('staff_shifts')
      .select('*')
      .eq('restaurant_id', restaurant_id)
      .order('shift_start', { ascending: false })
      .limit(100);

    const { data: sales } = await supabaseClient
      .from('sales')
      .select('sale_date, total_price, quantity')
      .eq('restaurant_id', restaurant_id)
      .order('sale_date', { ascending: false })
      .limit(30);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      // Return basic forecast without AI
      const recommendations = [
        `You have ${staff?.length || 0} staff members available`,
        `Based on recent shifts, maintain current staffing levels`,
        `Consider adding coverage during peak lunch and dinner hours`,
      ];
      
      return new Response(JSON.stringify({
        recommendations,
        insights: recommendations,
        forecastDays,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate average sales per day of week
    const salesByDay: Record<string, number[]> = {};
    sales?.forEach((sale: any) => {
      const date = new Date(sale.sale_date);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      if (!salesByDay[dayName]) salesByDay[dayName] = [];
      salesByDay[dayName].push(Number(sale.total_price));
    });

    const avgSalesByDay = Object.entries(salesByDay).map(([day, values]) => ({
      day,
      avgRevenue: values.reduce((a, b) => a + b, 0) / values.length,
    }));

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
            content: "You are a restaurant staffing optimization expert. Provide specific, actionable staffing recommendations."
          },
          {
            role: "user",
            content: `Generate a ${forecastDays}-day staffing forecast:

STAFF AVAILABLE:
- Total staff: ${staff?.length || 0}
- Active: ${staff?.filter((s: any) => s.status === 'active').length || 0}

SALES PATTERNS:
${avgSalesByDay.map(d => `- ${d.day}: Avg $${d.avgRevenue.toFixed(2)}`).join('\n') || 'No historical data'}

RECENT SHIFTS:
${shifts?.slice(0, 10).map((s: any) => `- ${new Date(s.shift_start).toLocaleDateString()}: ${new Date(s.shift_start).toLocaleTimeString()} - ${new Date(s.shift_end).toLocaleTimeString()}`).join('\n') || 'No recent shifts'}

Provide:
1. Daily staffing recommendations for the next ${forecastDays} days
2. Peak hour coverage suggestions
3. Cost optimization opportunities
4. Any staffing risks to watch

Format as JSON with keys: recommendations (array of strings), insights (array of strings), dailyForecast (array with day, minStaff, maxStaff)`
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
          insights: [],
          dailyForecast: []
        };
      }
    } catch {
      parsed = {
        recommendations: [content],
        insights: [],
        dailyForecast: []
      };
    }

    console.log('Staff forecasting generated successfully');
    
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in ai-staff-forecasting:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      recommendations: ["Unable to generate staff forecast at this time."],
      insights: []
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
