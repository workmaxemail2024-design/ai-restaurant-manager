import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { location_id, pos_provider, sales } = await req.json();

    if (!location_id || !pos_provider || !sales) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: location_id, pos_provider, sales" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get existing mappings for this location/provider
    const { data: mappings } = await supabase
      .from("pos_mappings")
      .select("*")
      .eq("location_id", location_id)
      .eq("pos_provider", pos_provider)
      .eq("mapping_type", "dish");

    const mappingMap = new Map(mappings?.map(m => [m.external_id, m]) || []);

    // Get all dishes for fuzzy matching
    const { data: dishes } = await supabase.from("dishes").select("id, name");
    
    const results = {
      imported: 0,
      mapped: 0,
      unmapped: 0,
      errors: [] as string[],
    };

    for (const sale of sales) {
      try {
        const externalId = sale.item_id || sale.product_id || sale.id;
        const externalName = sale.item_name || sale.product_name || sale.name;
        
        // Check if we have a mapping
        let mappedDishId = null;
        const existingMapping = mappingMap.get(externalId);
        
        if (existingMapping?.internal_id) {
          mappedDishId = existingMapping.internal_id;
        } else if (dishes && externalName) {
          // Try fuzzy match
          const match = dishes.find(d => 
            d.name.toLowerCase().includes(externalName.toLowerCase()) ||
            externalName.toLowerCase().includes(d.name.toLowerCase())
          );
          if (match) {
            mappedDishId = match.id;
            // Save the mapping
            await supabase.from("pos_mappings").upsert({
              location_id,
              pos_provider,
              mapping_type: "dish",
              external_id: externalId,
              external_name: externalName,
              internal_id: match.id,
              confidence_score: 0.7,
              is_verified: false,
            });
          }
        }

        // Store raw import
        const { error: importError } = await supabase.from("pos_sales_import").insert({
          location_id,
          pos_provider,
          external_sale_id: sale.transaction_id || sale.id,
          data: sale,
          mapped_dish_id: mappedDishId,
          mapped_total_price: sale.total || sale.amount || sale.price,
          mapped_quantity: sale.quantity || 1,
          mapped_sale_date: sale.date || sale.timestamp ? new Date(sale.date || sale.timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          sync_status: mappedDishId ? "mapped" : "pending",
        });

        if (importError) throw importError;

        results.imported++;

        // If mapped, also insert into main sales table
        if (mappedDishId) {
          const { error: salesError } = await supabase.from("sales").insert({
            location_id,
            dish_id: mappedDishId,
            quantity: sale.quantity || 1,
            total_price: sale.total || sale.amount || sale.price || 0,
            sale_date: sale.date || sale.timestamp ? new Date(sale.date || sale.timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          });

          if (!salesError) {
            results.mapped++;
          }
        } else {
          results.unmapped++;
        }
      } catch (err) {
        results.errors.push(err instanceof Error ? err.message : "Unknown error");
      }
    }

    // Log the sync
    await supabase.from("pos_sync_logs").insert({
      location_id,
      pos_provider,
      event_type: "sales_import",
      message: `Imported ${results.imported} sales, ${results.mapped} mapped, ${results.unmapped} unmapped`,
      status: results.errors.length > 0 ? "partial" : "success",
      details: results,
    });

    // Update last sync time
    await supabase
      .from("pos_integrations")
      .update({ last_sync_time: new Date().toISOString() })
      .eq("location_id", location_id)
      .eq("pos_provider", pos_provider);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("POS import sales error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
