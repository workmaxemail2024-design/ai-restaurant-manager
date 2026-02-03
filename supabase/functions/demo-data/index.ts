import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DemoDataRequest {
  action: "reset" | "seed" | "get_status" | "prepare_live_pos";
  restaurant_id: string;
}

interface DeletedCounts {
  sales: number;
  pos_sales_import: number;
  pos_staff_import: number;
  pos_sync_logs: number;
  pos_mappings: number;
  purchase_orders: number;
  purchase_order_items: number;
  documents: number;
  stock_levels: number;
  stock_adjustments: number;
  dishes: number;
  dish_ingredients: number;
  ingredients: number;
  ingredient_prices: number;
  suppliers: number;
  overheads: number;
  staff: number;
  staff_shifts: number;
  staff_attendance: number;
  staff_performance: number;
  notifications: number;
  audit_logs: number;
  automation_rule_runs: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  
  if (!serviceRoleKey) {
    return new Response(
      JSON.stringify({ success: false, error: "Server configuration error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { action, restaurant_id }: DemoDataRequest = await req.json();

    if (!restaurant_id) {
      return new Response(
        JSON.stringify({ success: false, error: "restaurant_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Demo data action: ${action} for restaurant: ${restaurant_id}`);

    if (action === "get_status") {
      // Check if demo mode is enabled
      const { data: restaurant } = await adminClient
        .from("restaurants")
        .select("id, name")
        .eq("id", restaurant_id)
        .single();

      // Count existing data
      const counts = await Promise.all([
        adminClient.from("sales").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurant_id),
        adminClient.from("staff").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurant_id),
        adminClient.from("dishes").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurant_id),
        adminClient.from("ingredients").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurant_id),
      ]);

      return new Response(
        JSON.stringify({
          success: true,
          restaurant_name: restaurant?.name,
          counts: {
            sales: counts[0].count || 0,
            staff: counts[1].count || 0,
            dishes: counts[2].count || 0,
            ingredients: counts[3].count || 0,
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reset") {
      console.log("Resetting demo data...");
      
      // Get location IDs for this restaurant
      const { data: locations } = await adminClient
        .from("locations")
        .select("id")
        .eq("restaurant_id", restaurant_id);
      
      const locationIds = locations?.map(l => l.id) || [];

      // Delete in order to respect foreign keys
      // 1. Delete sales (depends on dishes)
      await adminClient.from("sales").delete().eq("restaurant_id", restaurant_id);
      
      // 2. Delete POS imports
      if (locationIds.length > 0) {
        await adminClient.from("pos_sales_import").delete().in("location_id", locationIds);
        await adminClient.from("pos_staff_import").delete().in("location_id", locationIds);
        await adminClient.from("pos_sync_logs").delete().in("location_id", locationIds);
        await adminClient.from("pos_mappings").delete().in("location_id", locationIds);
      }
      
      // 3. Delete staff-related data
      const { data: staffIds } = await adminClient.from("staff").select("id").eq("restaurant_id", restaurant_id);
      if (staffIds && staffIds.length > 0) {
        const ids = staffIds.map(s => s.id);
        await adminClient.from("staff_attendance").delete().in("staff_id", ids);
        await adminClient.from("staff_shifts").delete().in("staff_id", ids);
        await adminClient.from("staff_performance").delete().in("staff_id", ids);
      }
      await adminClient.from("staff").delete().eq("restaurant_id", restaurant_id);
      
      // 4. Delete purchase orders and items
      const { data: poIds } = await adminClient.from("purchase_orders").select("id").eq("restaurant_id", restaurant_id);
      if (poIds && poIds.length > 0) {
        const ids = poIds.map(p => p.id);
        await adminClient.from("purchase_order_items").delete().in("purchase_order_id", ids);
        await adminClient.from("documents").delete().in("purchase_order_id", ids);
      }
      await adminClient.from("purchase_orders").delete().eq("restaurant_id", restaurant_id);
      
      // 5. Delete documents
      await adminClient.from("documents").delete().eq("restaurant_id", restaurant_id);
      
      // 6. Delete dish ingredients and dishes
      await adminClient.from("dish_ingredients").delete().eq("restaurant_id", restaurant_id);
      await adminClient.from("dishes").delete().eq("restaurant_id", restaurant_id);
      
      // 7. Delete stock data
      if (locationIds.length > 0) {
        await adminClient.from("stock_adjustments").delete().in("location_id", locationIds);
        await adminClient.from("stock_levels").delete().in("location_id", locationIds);
      }
      
      // 8. Delete ingredient prices and ingredients
      await adminClient.from("ingredient_prices").delete().eq("restaurant_id", restaurant_id);
      await adminClient.from("ingredients").delete().eq("restaurant_id", restaurant_id);
      
      // 9. Delete suppliers
      await adminClient.from("suppliers").delete().eq("restaurant_id", restaurant_id);
      
      // 10. Delete notifications and audit logs
      await adminClient.from("notifications").delete().eq("restaurant_id", restaurant_id);
      await adminClient.from("audit_logs").delete().eq("restaurant_id", restaurant_id);
      
      // 11. Delete automation rule runs (keep rules)
      await adminClient.from("automation_rule_runs").delete().eq("restaurant_id", restaurant_id);
      
      // 12. Delete overheads
      await adminClient.from("overheads").delete().eq("restaurant_id", restaurant_id);

      console.log("Demo data reset complete");
      
      return new Response(
        JSON.stringify({ success: true, message: "Demo data reset complete" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "seed") {
      console.log("Seeding demo data...");
      
      // Get the first location for this restaurant
      const { data: locations } = await adminClient
        .from("locations")
        .select("id")
        .eq("restaurant_id", restaurant_id)
        .limit(1);
      
      let locationId = locations?.[0]?.id;
      
      // Create a location if none exists
      if (!locationId) {
        const { data: newLocation } = await adminClient
          .from("locations")
          .insert({ name: "Demo Location", restaurant_id })
          .select()
          .single();
        locationId = newLocation?.id;
      }

      if (!locationId) {
        return new Response(
          JSON.stringify({ success: false, error: "Failed to create location" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Create suppliers
      const { data: suppliers } = await adminClient
        .from("suppliers")
        .insert([
          { name: "Fresh Farms Co.", contact_name: "John Smith", email: "orders@freshfarms.com", phone: "+1-555-0101", restaurant_id },
          { name: "Premium Meats Ltd.", contact_name: "Sarah Johnson", email: "supply@premiummeats.com", phone: "+1-555-0102", restaurant_id },
        ])
        .select();

      // 2. Create ingredients
      const { data: ingredients } = await adminClient
        .from("ingredients")
        .insert([
          { name: "Chicken Breast", unit: "kg", storage_type: "fridge", default_cost_price: 8.50, restaurant_id, supplier_id: suppliers?.[1]?.id },
          { name: "Salmon Fillet", unit: "kg", storage_type: "fridge", default_cost_price: 18.00, restaurant_id, supplier_id: suppliers?.[1]?.id },
          { name: "Beef Ribeye", unit: "kg", storage_type: "fridge", default_cost_price: 25.00, restaurant_id, supplier_id: suppliers?.[1]?.id },
          { name: "Mixed Greens", unit: "kg", storage_type: "fridge", default_cost_price: 4.50, restaurant_id, supplier_id: suppliers?.[0]?.id },
          { name: "Tomatoes", unit: "kg", storage_type: "fridge", default_cost_price: 3.20, restaurant_id, supplier_id: suppliers?.[0]?.id },
          { name: "Olive Oil", unit: "L", storage_type: "dry", default_cost_price: 12.00, restaurant_id, supplier_id: suppliers?.[0]?.id },
          { name: "Pasta", unit: "kg", storage_type: "dry", default_cost_price: 2.50, restaurant_id, supplier_id: suppliers?.[0]?.id },
          { name: "Rice", unit: "kg", storage_type: "dry", default_cost_price: 2.00, restaurant_id, supplier_id: suppliers?.[0]?.id },
        ])
        .select();

      // 3. Create dishes
      const { data: dishes } = await adminClient
        .from("dishes")
        .insert([
          { name: "Grilled Chicken Salad", category: "Salads", selling_price: 16.50, restaurant_id, location_id: locationId },
          { name: "Pan-Seared Salmon", category: "Mains", selling_price: 28.00, restaurant_id, location_id: locationId },
          { name: "Ribeye Steak", category: "Mains", selling_price: 38.00, restaurant_id, location_id: locationId },
          { name: "Caesar Salad", category: "Salads", selling_price: 12.00, restaurant_id, location_id: locationId },
          { name: "Pasta Primavera", category: "Mains", selling_price: 18.00, restaurant_id, location_id: locationId },
          { name: "House Soup", category: "Starters", selling_price: 8.00, restaurant_id, location_id: locationId },
        ])
        .select();

      // 4. Create dish ingredients
      if (dishes && ingredients) {
        const dishIngredients = [
          { dish_id: dishes[0].id, ingredient_id: ingredients[0].id, quantity: 0.2, restaurant_id },
          { dish_id: dishes[0].id, ingredient_id: ingredients[3].id, quantity: 0.1, restaurant_id },
          { dish_id: dishes[1].id, ingredient_id: ingredients[1].id, quantity: 0.25, restaurant_id },
          { dish_id: dishes[2].id, ingredient_id: ingredients[2].id, quantity: 0.3, restaurant_id },
          { dish_id: dishes[4].id, ingredient_id: ingredients[6].id, quantity: 0.15, restaurant_id },
        ];
        await adminClient.from("dish_ingredients").insert(dishIngredients);
      }

      // 5. Create staff
      const { data: staff } = await adminClient
        .from("staff")
        .insert([
          { first_name: "Alice", last_name: "Thompson", role: "manager", hourly_rate: 22.00, contract_type: "full_time", max_hours_per_week: 40, restaurant_id, location_id: locationId },
          { first_name: "Bob", last_name: "Martinez", role: "chef", hourly_rate: 20.00, contract_type: "full_time", max_hours_per_week: 40, restaurant_id, location_id: locationId },
          { first_name: "Carol", last_name: "Williams", role: "waiter", hourly_rate: 15.00, contract_type: "part_time", max_hours_per_week: 25, restaurant_id, location_id: locationId },
          { first_name: "David", last_name: "Brown", role: "waiter", hourly_rate: 15.00, contract_type: "part_time", max_hours_per_week: 25, restaurant_id, location_id: locationId },
          { first_name: "Eva", last_name: "Garcia", role: "bartender", hourly_rate: 16.00, contract_type: "full_time", max_hours_per_week: 35, restaurant_id, location_id: locationId },
        ])
        .select();

      // 6. Create purchase orders
      const today = new Date();
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      const { data: pos } = await adminClient
        .from("purchase_orders")
        .insert([
          { supplier_id: suppliers?.[0]?.id, location_id: locationId, status: "completed", order_date: weekAgo.toISOString().split('T')[0], received_at: weekAgo.toISOString(), restaurant_id },
          { supplier_id: suppliers?.[1]?.id, location_id: locationId, status: "pending", order_date: today.toISOString().split('T')[0], restaurant_id },
        ])
        .select();

      // 7. Create PO items
      if (pos && ingredients) {
        await adminClient.from("purchase_order_items").insert([
          { purchase_order_id: pos[0].id, ingredient_id: ingredients[3].id, quantity: 10, cost_price: 4.50, restaurant_id },
          { purchase_order_id: pos[0].id, ingredient_id: ingredients[4].id, quantity: 15, cost_price: 3.20, restaurant_id },
          { purchase_order_id: pos[1].id, ingredient_id: ingredients[0].id, quantity: 20, cost_price: 8.50, restaurant_id },
          { purchase_order_id: pos[1].id, ingredient_id: ingredients[2].id, quantity: 10, cost_price: 25.00, restaurant_id },
        ]);
      }

      // 8. Create 7 days of sales data
      if (dishes) {
        const salesData = [];
        for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
          const saleDate = new Date(today);
          saleDate.setDate(saleDate.getDate() - dayOffset);
          const saleDateStr = saleDate.toISOString().split('T')[0];
          
          // Random sales for each day
          const numSales = Math.floor(Math.random() * 15) + 10; // 10-24 sales per day
          for (let i = 0; i < numSales; i++) {
            const dish = dishes[Math.floor(Math.random() * dishes.length)];
            const quantity = Math.floor(Math.random() * 3) + 1;
            salesData.push({
              dish_id: dish.id,
              location_id: locationId,
              sale_date: saleDateStr,
              quantity,
              total_price: dish.selling_price * quantity,
              restaurant_id,
            });
          }
        }
        await adminClient.from("sales").insert(salesData);
      }

      // 9. Create stock levels
      if (ingredients) {
        const stockLevels = ingredients.map(ing => ({
          ingredient_id: ing.id,
          location_id: locationId,
          quantity: Math.floor(Math.random() * 50) + 10,
          restaurant_id,
        }));
        await adminClient.from("stock_levels").insert(stockLevels);
      }

      // 10. Create some overheads
      await adminClient.from("overheads").insert([
        { name: "Rent", category: "Premises", amount: 5000, frequency: "monthly", is_active: true, restaurant_id, location_id: locationId },
        { name: "Utilities", category: "Utilities", amount: 800, frequency: "monthly", is_active: true, restaurant_id, location_id: locationId },
        { name: "Insurance", category: "Insurance", amount: 300, frequency: "monthly", is_active: true, restaurant_id, location_id: locationId },
      ]);

      console.log("Demo data seeding complete");
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Demo data seeded successfully",
          summary: {
            suppliers: suppliers?.length || 0,
            ingredients: ingredients?.length || 0,
            dishes: dishes?.length || 0,
            staff: staff?.length || 0,
            purchase_orders: pos?.length || 0,
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "prepare_live_pos") {
      console.log("Preparing for live POS - comprehensive data wipe...");
      
      // Get location IDs for this restaurant
      const { data: locations } = await adminClient
        .from("locations")
        .select("id")
        .eq("restaurant_id", restaurant_id);
      
      const locationIds = locations?.map(l => l.id) || [];
      
      const deletedCounts: DeletedCounts = {
        sales: 0,
        pos_sales_import: 0,
        pos_staff_import: 0,
        pos_sync_logs: 0,
        pos_mappings: 0,
        purchase_orders: 0,
        purchase_order_items: 0,
        documents: 0,
        stock_levels: 0,
        stock_adjustments: 0,
        dishes: 0,
        dish_ingredients: 0,
        ingredients: 0,
        ingredient_prices: 0,
        suppliers: 0,
        overheads: 0,
        staff: 0,
        staff_shifts: 0,
        staff_attendance: 0,
        staff_performance: 0,
        notifications: 0,
        audit_logs: 0,
        automation_rule_runs: 0,
      };

      // Helper to delete and count
      async function deleteAndCount(table: string, filter: { column: string; value: string | string[]; operator?: "eq" | "in" }): Promise<number> {
        let query = adminClient.from(table).delete({ count: "exact" });
        if (filter.operator === "in" && Array.isArray(filter.value)) {
          if (filter.value.length === 0) return 0;
          query = query.in(filter.column, filter.value);
        } else {
          query = query.eq(filter.column, filter.value as string);
        }
        const { count } = await query;
        return count || 0;
      }

      // 1. Delete sales (core sales table)
      deletedCounts.sales = await deleteAndCount("sales", { column: "restaurant_id", value: restaurant_id });
      
      // 2. Delete POS imports and sync data
      if (locationIds.length > 0) {
        deletedCounts.pos_sales_import = await deleteAndCount("pos_sales_import", { column: "location_id", value: locationIds, operator: "in" });
        deletedCounts.pos_staff_import = await deleteAndCount("pos_staff_import", { column: "location_id", value: locationIds, operator: "in" });
        deletedCounts.pos_sync_logs = await deleteAndCount("pos_sync_logs", { column: "location_id", value: locationIds, operator: "in" });
        // Keep pos_mappings as they may contain real mappings the user wants to preserve
        // deletedCounts.pos_mappings = await deleteAndCount("pos_mappings", { column: "location_id", value: locationIds, operator: "in" });
      }
      
      // 3. Delete staff-related operational data first (before deleting staff)
      const { data: staffIds } = await adminClient.from("staff").select("id").eq("restaurant_id", restaurant_id);
      if (staffIds && staffIds.length > 0) {
        const ids = staffIds.map(s => s.id);
        deletedCounts.staff_attendance = await deleteAndCount("staff_attendance", { column: "staff_id", value: ids, operator: "in" });
        deletedCounts.staff_shifts = await deleteAndCount("staff_shifts", { column: "staff_id", value: ids, operator: "in" });
        deletedCounts.staff_performance = await deleteAndCount("staff_performance", { column: "staff_id", value: ids, operator: "in" });
      }
      
      // 4. Delete staff records
      deletedCounts.staff = await deleteAndCount("staff", { column: "restaurant_id", value: restaurant_id });
      
      // 5. Delete purchase order items first (FK constraint)
      const { data: poIds } = await adminClient.from("purchase_orders").select("id").eq("restaurant_id", restaurant_id);
      if (poIds && poIds.length > 0) {
        const ids = poIds.map(p => p.id);
        deletedCounts.purchase_order_items = await deleteAndCount("purchase_order_items", { column: "purchase_order_id", value: ids, operator: "in" });
        // Also delete documents linked to POs
        await adminClient.from("documents").delete().in("purchase_order_id", ids);
      }
      
      // 6. Delete purchase orders
      deletedCounts.purchase_orders = await deleteAndCount("purchase_orders", { column: "restaurant_id", value: restaurant_id });
      
      // 7. Delete remaining documents (not linked to POs) and their storage objects
      const { data: docs } = await adminClient
        .from("documents")
        .select("id, storage_path")
        .eq("restaurant_id", restaurant_id);
      
      if (docs && docs.length > 0) {
        // Try to delete storage objects (non-critical if fails)
        const storagePaths = docs.map(d => d.storage_path).filter(Boolean);
        if (storagePaths.length > 0) {
          try {
            await adminClient.storage.from("documents").remove(storagePaths);
          } catch (storageErr) {
            console.warn("Storage cleanup warning:", storageErr);
          }
        }
      }
      deletedCounts.documents = await deleteAndCount("documents", { column: "restaurant_id", value: restaurant_id });
      
      // 8. Delete stock data
      if (locationIds.length > 0) {
        deletedCounts.stock_adjustments = await deleteAndCount("stock_adjustments", { column: "location_id", value: locationIds, operator: "in" });
        deletedCounts.stock_levels = await deleteAndCount("stock_levels", { column: "location_id", value: locationIds, operator: "in" });
      }
      
      // 9. Delete dish ingredients (before dishes)
      deletedCounts.dish_ingredients = await deleteAndCount("dish_ingredients", { column: "restaurant_id", value: restaurant_id });
      
      // 10. Delete dishes
      deletedCounts.dishes = await deleteAndCount("dishes", { column: "restaurant_id", value: restaurant_id });
      
      // 11. Delete ingredient prices (before ingredients)
      deletedCounts.ingredient_prices = await deleteAndCount("ingredient_prices", { column: "restaurant_id", value: restaurant_id });
      
      // 12. Delete ingredients
      deletedCounts.ingredients = await deleteAndCount("ingredients", { column: "restaurant_id", value: restaurant_id });
      
      // 13. Delete suppliers
      deletedCounts.suppliers = await deleteAndCount("suppliers", { column: "restaurant_id", value: restaurant_id });
      
      // 14. Delete overheads
      deletedCounts.overheads = await deleteAndCount("overheads", { column: "restaurant_id", value: restaurant_id });
      
      // 15. Delete notifications
      deletedCounts.notifications = await deleteAndCount("notifications", { column: "restaurant_id", value: restaurant_id });
      
      // 16. Delete audit logs
      deletedCounts.audit_logs = await deleteAndCount("audit_logs", { column: "restaurant_id", value: restaurant_id });
      
      // 17. Delete automation rule runs (keep the rules themselves)
      deletedCounts.automation_rule_runs = await deleteAndCount("automation_rule_runs", { column: "restaurant_id", value: restaurant_id });

      console.log("Prepare for live POS complete:", deletedCounts);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "All operational data has been wiped. Ready for live POS sync.",
          deletedCounts
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Demo data error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
