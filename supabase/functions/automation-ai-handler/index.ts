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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action_type, restaurant_id, config } = await req.json();

    if (!action_type || !restaurant_id) {
      return new Response(JSON.stringify({ error: 'Missing action_type or restaurant_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user belongs to restaurant
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

    console.log(`Processing AI action: ${action_type} for restaurant: ${restaurant_id}`);

    let result: any = { action_type, status: 'processed' };

    switch (action_type) {
      case 'daily_summary':
        // Generate daily summary using AI
        if (lovableApiKey) {
          const { data: sales } = await supabase
            .from('sales')
            .select('*, dishes(name)')
            .eq('restaurant_id', restaurant_id)
            .gte('sale_date', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

          const totalRevenue = sales?.reduce((sum, s) => sum + Number(s.total_price), 0) || 0;
          const totalSales = sales?.length || 0;

          const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${lovableApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                {
                  role: 'system',
                  content: 'You are a restaurant operations AI. Generate a brief daily summary based on the data provided. Be concise and actionable.',
                },
                {
                  role: 'user',
                  content: `Generate a daily summary for a restaurant with: ${totalSales} sales, $${totalRevenue.toFixed(2)} revenue. Top dishes: ${sales?.slice(0, 5).map(s => s.dishes?.name).join(', ') || 'N/A'}`,
                },
              ],
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const summary = aiData.choices?.[0]?.message?.content || 'Summary generation failed';

            // Create notification with summary
            await supabase.rpc('create_notification', {
              p_restaurant_id: restaurant_id,
              p_title: 'Daily AI Summary',
              p_message: summary,
              p_type: 'info',
            });

            result.summary = summary;
          }
        }
        break;

      case 'weekly_forecast':
        // Generate weekly forecast
        if (lovableApiKey) {
          const { data: historicalSales } = await supabase
            .from('sales')
            .select('sale_date, total_price')
            .eq('restaurant_id', restaurant_id)
            .order('sale_date', { ascending: false })
            .limit(30);

          const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${lovableApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                {
                  role: 'system',
                  content: 'You are a restaurant analytics AI. Generate a brief forecast based on historical data. Be concise.',
                },
                {
                  role: 'user',
                  content: `Generate a weekly forecast based on: ${JSON.stringify(historicalSales?.slice(0, 10) || [])}`,
                },
              ],
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const forecast = aiData.choices?.[0]?.message?.content || 'Forecast generation failed';

            await supabase.rpc('create_notification', {
              p_restaurant_id: restaurant_id,
              p_title: 'Weekly Forecast Ready',
              p_message: forecast,
              p_type: 'info',
            });

            result.forecast = forecast;
          }
        }
        break;

      case 'price_optimization':
        // AI-assisted price optimization
        result.status = 'queued';
        result.message = 'Price optimization analysis queued';
        break;

      default:
        result.status = 'skipped';
        result.message = 'Unknown AI action type';
    }

    // Log to audit
    await supabase.rpc('log_audit_event', {
      p_restaurant_id: restaurant_id,
      p_event_type: 'ai_action',
      p_description: `AI action "${action_type}" executed`,
      p_data: result,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in automation-ai-handler:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
