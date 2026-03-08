import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const eurFmt = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { date, restaurant_id, location_id } = await req.json();

    if (!restaurant_id) {
      return new Response(JSON.stringify({ error: "restaurant_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify membership
    const { data: membership } = await userClient
      .from("user_restaurants")
      .select("id")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurant_id)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetDate = date || new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const locFilter = location_id && location_id !== "all" ? location_id : null;

    // Check if summary already exists
    let existingQuery = adminClient
      .from("daily_ai_summaries")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .eq("summary_date", targetDate);

    if (locFilter) {
      existingQuery = existingQuery.eq("location_id", locFilter);
    } else {
      existingQuery = existingQuery.is("location_id", null);
    }

    const { data: existing } = await existingQuery.maybeSingle();
    if (existing) {
      return new Response(JSON.stringify(existing), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Gather metrics from database ──

    // Sales
    let salesQuery = adminClient
      .from("sales")
      .select("dish_id, quantity, total_price, dishes(name)")
      .eq("restaurant_id", restaurant_id)
      .eq("sale_date", targetDate);
    if (locFilter) salesQuery = salesQuery.eq("location_id", locFilter);
    const { data: salesData } = await salesQuery;

    const sales = salesData || [];
    const totalRevenue = sales.reduce((s, r) => s + Number(r.total_price), 0);
    const totalOrders = sales.reduce((s, r) => s + r.quantity, 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const foodCostPct = totalRevenue > 0 ? 30 : 0; // Estimated

    if (totalRevenue === 0) {
      return new Response(
        JSON.stringify({
          summary_text: "No operational data available.",
          metrics_json: { revenue: 0, orders: 0, date: targetDate },
          no_data: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Dish aggregation
    const dishMap: Record<string, { name: string; quantity: number; revenue: number }> = {};
    for (const s of sales) {
      const key = s.dish_id;
      if (!dishMap[key]) {
        dishMap[key] = { name: (s.dishes as any)?.name || "Unknown", quantity: 0, revenue: 0 };
      }
      dishMap[key].quantity += s.quantity;
      dishMap[key].revenue += Number(s.total_price);
    }
    const sortedDishes = Object.values(dishMap).sort((a, b) => b.quantity - a.quantity);
    const topDishes = sortedDishes.slice(0, 5);
    const bottomDishes = sortedDishes.length > 1 ? sortedDishes.slice(-3).reverse() : [];

    // Labour (attendance)
    let attendanceQuery = adminClient
      .from("staff_attendance")
      .select("clock_in, clock_out, staff(hourly_rate)")
      .eq("restaurant_id", restaurant_id)
      .gte("clock_in", `${targetDate}T00:00:00`)
      .lte("clock_in", `${targetDate}T23:59:59`);
    if (locFilter) attendanceQuery = attendanceQuery.eq("location_id", locFilter);
    const { data: attendanceData } = await attendanceQuery;

    let totalLabourHours = 0;
    let totalLabourCost = 0;
    for (const a of attendanceData || []) {
      if (a.clock_in && a.clock_out) {
        const hours = (new Date(a.clock_out).getTime() - new Date(a.clock_in).getTime()) / 3600000;
        totalLabourHours += hours;
        totalLabourCost += hours * (Number((a.staff as any)?.hourly_rate) || 12.5);
      }
    }
    const labourPct = totalRevenue > 0 ? (totalLabourCost / totalRevenue) * 100 : 0;

    // Ledger (covers, expenses)
    let ledgerQuery = adminClient
      .from("daily_ledger_entries")
      .select("covers, additional_expenses")
      .eq("restaurant_id", restaurant_id)
      .eq("entry_date", targetDate);
    if (locFilter) {
      ledgerQuery = ledgerQuery.eq("location_id", locFilter);
    } else {
      ledgerQuery = ledgerQuery.is("location_id", null);
    }
    const { data: ledgerData } = await ledgerQuery.maybeSingle();

    const covers = ledgerData?.covers ?? 0;
    const expenses = Number(ledgerData?.additional_expenses) || 0;

    // Reservations count
    let resQuery = adminClient
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant_id)
      .gte("start_at", `${targetDate}T00:00:00`)
      .lte("start_at", `${targetDate}T23:59:59`);
    if (locFilter) resQuery = resQuery.eq("location_id", locFilter);
    const { count: reservationCount } = await resQuery;

    const estimatedFoodCost = totalRevenue * 0.3;
    const estimatedProfit = totalRevenue - estimatedFoodCost - totalLabourCost - expenses;

    const metricsJson = {
      date: targetDate,
      revenue: totalRevenue,
      orders: totalOrders,
      avg_order_value: avgOrderValue,
      food_cost_pct: foodCostPct,
      labour_cost: totalLabourCost,
      labour_pct: labourPct,
      labour_hours: totalLabourHours,
      covers,
      expenses,
      estimated_profit: estimatedProfit,
      reservations: reservationCount || 0,
      top_dishes: topDishes,
      bottom_dishes: bottomDishes,
    };

    // ── Generate AI summary ──
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let summaryText: string;

    if (!LOVABLE_API_KEY) {
      // Fallback: structured text without AI
      summaryText = buildFallbackSummary(metricsJson, targetDate);
    } else {
      const prompt = `Generate a concise daily restaurant operations summary based on this data:

Date: ${targetDate}
Revenue: ${eurFmt.format(totalRevenue)}
Orders: ${totalOrders}
Average Order Value: ${eurFmt.format(avgOrderValue)}
Food Cost: ~${foodCostPct}%
Labour Cost: ${eurFmt.format(totalLabourCost)} (${labourPct.toFixed(1)}%)
Labour Hours: ${totalLabourHours.toFixed(1)}h
Covers: ${covers || "Not recorded"}
Additional Expenses: ${eurFmt.format(expenses)}
Estimated Profit: ${eurFmt.format(estimatedProfit)}
Reservations: ${reservationCount || 0}

Top Dishes:
${topDishes.map((d) => `- ${d.name}: ${d.quantity} sold (${eurFmt.format(d.revenue)})`).join("\n")}

Worst Performers:
${bottomDishes.map((d) => `- ${d.name}: ${d.quantity} sold`).join("\n") || "N/A"}

Write the summary with these sections:
1. A 2-3 sentence overview of the day
2. "Operational Insights" - 3-4 bullet points analyzing the data
3. "Suggested Actions" - 2-3 actionable recommendations for tomorrow

Use € for currency. Be specific with numbers. Keep it concise and professional.`;

      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content:
                  "You are a senior restaurant operations manager. Provide direct, data-driven daily briefings. Always use EUR (€) for currency. Be concise.",
              },
              { role: "user", content: prompt },
            ],
          }),
        });

        if (!aiResponse.ok) {
          if (aiResponse.status === 429) {
            return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (aiResponse.status === 402) {
            return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up." }), {
              status: 402,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          console.error("AI gateway error:", aiResponse.status);
          summaryText = buildFallbackSummary(metricsJson, targetDate);
        } else {
          const aiData = await aiResponse.json();
          summaryText = aiData.choices?.[0]?.message?.content || buildFallbackSummary(metricsJson, targetDate);
        }
      } catch (aiErr) {
        console.error("AI call failed:", aiErr);
        summaryText = buildFallbackSummary(metricsJson, targetDate);
      }
    }

    // ── Persist summary ──
    const { data: saved, error: saveError } = await adminClient
      .from("daily_ai_summaries")
      .upsert(
        {
          restaurant_id,
          location_id: locFilter,
          summary_date: targetDate,
          summary_text: summaryText,
          metrics_json: metricsJson,
        },
        { onConflict: "restaurant_id,location_id,summary_date" }
      )
      .select()
      .single();

    if (saveError) {
      console.error("Save error:", saveError);
    }

    return new Response(JSON.stringify(saved || { summary_text: summaryText, metrics_json: metricsJson }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ai-daily-summary error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function buildFallbackSummary(m: any, date: string): string {
  const eurFmt = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
  return `## Daily Summary — ${date}

**Revenue:** ${eurFmt.format(m.revenue)} | **Orders:** ${m.orders} | **Avg Order:** ${eurFmt.format(m.avg_order_value)}

**Food Cost:** ~${m.food_cost_pct}% | **Labour:** ${eurFmt.format(m.labour_cost)} (${m.labour_pct.toFixed(1)}%) | **Estimated Profit:** ${eurFmt.format(m.estimated_profit)}

### Top Dishes
${m.top_dishes.map((d: any) => `- ${d.name} — ${d.quantity} sold`).join("\n")}

### Underperformers
${m.bottom_dishes.map((d: any) => `- ${d.name} — ${d.quantity} sold`).join("\n") || "N/A"}

${m.covers > 0 ? `**Covers:** ${m.covers}` : ""}
${m.reservations > 0 ? `**Reservations:** ${m.reservations}` : ""}`;
}
