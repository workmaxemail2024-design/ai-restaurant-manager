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
      staff, 
      salesPatterns, 
      peakHours,
      staffPerformance,
      weekStartDate,
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
        schedule: [],
        insights: "AI scheduling unavailable. Please configure LOVABLE_API_KEY."
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate staff efficiency scores
    const staffWithScores = staff?.map((s: any) => {
      const perf = staffPerformance?.find((p: any) => p.staff_id === s.id);
      const score = perf?.score || 50;
      return { ...s, efficiencyScore: score };
    }) || [];

    // Sort staff by efficiency
    const rankedStaff = [...staffWithScores].sort((a, b) => b.efficiencyScore - a.efficiencyScore);

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
            content: "You are a restaurant staff scheduling expert. Generate optimal schedules based on sales patterns and staff performance."
          },
          {
            role: "user",
            content: `Generate a weekly staff schedule starting ${weekStartDate || 'next Monday'}:

AVAILABLE STAFF:
${rankedStaff.slice(0, 10).map((s: any) => `- ${s.first_name} ${s.last_name} (${s.role}, efficiency: ${s.efficiencyScore})`).join('\n') || 'No staff data'}

PEAK HOURS:
${peakHours?.map((h: any) => `- ${h.hour}:00: ${h.avgSales} avg sales`).join('\n') || 'No data'}

SALES PATTERNS:
${salesPatterns?.map((p: any) => `- ${p.day}: €${p.revenue}`).join('\n') || 'No data'}

Generate a schedule that:
1. Has more staff during peak hours
2. Assigns top performers to busiest shifts
3. Ensures adequate coverage

Format as JSON with:
- schedule: array of { day, date, shifts: [{ staffId, staffName, start, end, role }] }
- insights: string with scheduling recommendations
- totalHours: number
- estimatedCost: number`
          }
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    
    // Try to parse as JSON
    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = {
          schedule: [],
          insights: content,
          totalHours: 0,
          estimatedCost: 0
        };
      }
    } catch {
      parsed = {
        schedule: [],
        insights: content,
        totalHours: 0,
        estimatedCost: 0
      };
    }

    return new Response(JSON.stringify({
      ...parsed,
      staffRanking: rankedStaff.slice(0, 10).map((s: any) => ({
        id: s.id,
        name: `${s.first_name} ${s.last_name}`,
        role: s.role,
        score: s.efficiencyScore
      }))
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in ai-staff-scheduling:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      schedule: [],
      insights: "Unable to generate AI schedule at this time."
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
