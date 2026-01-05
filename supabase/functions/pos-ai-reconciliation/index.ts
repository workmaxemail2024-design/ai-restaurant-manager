import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function formatEUR(n: number): string {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for data operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { location_id, pos_provider, restaurant_id } = await req.json();

    if (!location_id) {
      return new Response(
        JSON.stringify({ error: "Missing location_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Get unmapped sales imports
    let query = supabase
      .from("pos_sales_import")
      .select("*")
      .eq("location_id", location_id)
      .eq("sync_status", "pending");
    
    if (pos_provider) {
      query = query.eq("pos_provider", pos_provider);
    }

    const { data: unmappedSales } = await query;

    // Get all dishes for suggestions
    const { data: dishes } = await supabase.from("dishes").select("id, name, category, selling_price");

    // Get system sales totals
    const { data: systemSales } = await supabase
      .from("sales")
      .select("total_price, sale_date")
      .eq("location_id", location_id);

    // Get POS sales totals
    const { data: posSales } = await supabase
      .from("pos_sales_import")
      .select("mapped_total_price, mapped_sale_date")
      .eq("location_id", location_id)
      .eq("sync_status", "mapped");

    // Calculate totals
    const systemTotal = systemSales?.reduce((sum, s) => sum + Number(s.total_price), 0) || 0;
    const posTotal = posSales?.reduce((sum, s) => sum + Number(s.mapped_total_price), 0) || 0;

    // Generate AI suggestions for unmapped items
    const suggestions = (unmappedSales || []).map(sale => {
      const itemName = sale.data?.item_name || sale.data?.product_name || sale.data?.name || "";
      const itemPrice = sale.mapped_total_price || 0;

      // Find best matches
      const matches = (dishes || [])
        .map(dish => {
          let score = 0;
          
          // Name similarity
          if (dish.name.toLowerCase().includes(itemName.toLowerCase())) score += 50;
          if (itemName.toLowerCase().includes(dish.name.toLowerCase())) score += 40;
          
          // Price similarity (within 20%)
          const priceDiff = Math.abs(dish.selling_price - itemPrice) / dish.selling_price;
          if (priceDiff < 0.2) score += 30;
          if (priceDiff < 0.1) score += 20;

          return { dish, score };
        })
        .filter(m => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      return {
        import_id: sale.id,
        external_name: itemName,
        external_price: itemPrice,
        suggested_matches: matches.map(m => ({
          dish_id: m.dish.id,
          dish_name: m.dish.name,
          dish_price: m.dish.selling_price,
          confidence: m.score,
        })),
      };
    });

    // Detect anomalies
    const anomalies = [];
    
    // Check for total mismatch
    const totalDifference = Math.abs(systemTotal - posTotal);
    if (totalDifference > 0 && systemTotal > 0) {
      const percentDiff = (totalDifference / systemTotal) * 100;
      if (percentDiff > 5) {
        anomalies.push({
          type: "total_mismatch",
          severity: percentDiff > 20 ? "high" : "medium",
          message: `System total (${formatEUR(systemTotal)}) differs from POS total (${formatEUR(posTotal)}) by ${percentDiff.toFixed(1)}%`,
          recommendation: "Review unmapped POS sales and verify all transactions are synced correctly",
        });
      }
    }

    // Check for unmapped items
    if (unmappedSales && unmappedSales.length > 10) {
      anomalies.push({
        type: "high_unmapped",
        severity: "high",
        message: `${unmappedSales.length} POS items are not mapped to system dishes`,
        recommendation: "Use the mapping suggestions below to link POS items to your menu",
      });
    }

    // Check for unusual transactions
    const avgPrice = systemTotal / (systemSales?.length || 1);
    const unusualTransactions = (unmappedSales || []).filter(s => {
      const price = Number(s.mapped_total_price) || 0;
      return price > avgPrice * 3 || price < 0;
    });

    if (unusualTransactions.length > 0) {
      anomalies.push({
        type: "unusual_transactions",
        severity: "medium",
        message: `${unusualTransactions.length} transactions have unusual amounts`,
        recommendation: "Review these transactions for potential errors or fraud",
        details: unusualTransactions.slice(0, 5).map(t => ({
          id: t.id,
          amount: t.mapped_total_price,
          date: t.mapped_sale_date,
        })),
      });
    }

    return new Response(
      JSON.stringify({
        summary: {
          system_total: systemTotal,
          pos_total: posTotal,
          difference: totalDifference,
          unmapped_count: unmappedSales?.length || 0,
          mapped_count: posSales?.length || 0,
        },
        anomalies,
        mapping_suggestions: suggestions,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("POS AI reconciliation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
