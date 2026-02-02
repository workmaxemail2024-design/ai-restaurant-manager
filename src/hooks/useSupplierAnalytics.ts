import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";

export interface IngredientPriceHistory {
  ingredient_id: string;
  ingredient_name: string;
  supplier_id: string;
  supplier_name: string;
  unit: string;
  prices: {
    date: string;
    price: number;
    po_id: string;
  }[];
  latestPrice: number;
  priceChange: number; // percentage change from first to last
  avgPrice: number;
}

export interface DeliveryPerformance {
  supplier_id: string;
  supplier_name: string;
  total_orders: number;
  received_orders: number;
  avg_delay_days: number;
  on_time_count: number;
  late_count: number;
  on_time_percentage: number;
  deliveries: {
    po_id: string;
    order_date: string;
    received_at: string | null;
    delay_days: number;
    status: string;
  }[];
}

// Get historical prices per ingredient from PO items
export function useIngredientPriceHistory(supplierId?: string) {
  return useQuery({
    queryKey: ["ingredient-price-history", supplierId],
    queryFn: async () => {
      // Get PO items with ingredient and supplier info
      let query = supabase
        .from("purchase_order_items")
        .select(`
          id,
          cost_price,
          quantity,
          ingredient_id,
          purchase_order_id,
          ingredients(id, name, unit, supplier_id, suppliers(id, name)),
          purchase_orders(id, order_date, supplier_id, suppliers(id, name))
        `)
        .order("purchase_order_id", { ascending: true });

      const { data, error } = await query;
      if (error) throw error;

      // Group by ingredient + supplier
      const priceMap = new Map<string, IngredientPriceHistory>();

      data?.forEach((item) => {
        const ingredient = item.ingredients as any;
        const po = item.purchase_orders as any;
        if (!ingredient || !po) return;

        const supplierFromPO = po.suppliers;
        if (!supplierFromPO) return;

        // Filter by supplier if specified
        if (supplierId && po.supplier_id !== supplierId) return;

        const key = `${item.ingredient_id}-${po.supplier_id}`;
        
        if (!priceMap.has(key)) {
          priceMap.set(key, {
            ingredient_id: item.ingredient_id,
            ingredient_name: ingredient.name,
            supplier_id: po.supplier_id,
            supplier_name: supplierFromPO.name,
            unit: ingredient.unit,
            prices: [],
            latestPrice: 0,
            priceChange: 0,
            avgPrice: 0,
          });
        }

        const entry = priceMap.get(key)!;
        entry.prices.push({
          date: po.order_date,
          price: Number(item.cost_price),
          po_id: item.purchase_order_id,
        });
      });

      // Calculate stats for each ingredient
      const results: IngredientPriceHistory[] = [];
      priceMap.forEach((entry) => {
        // Sort prices by date
        entry.prices.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        if (entry.prices.length > 0) {
          const firstPrice = entry.prices[0].price;
          const lastPrice = entry.prices[entry.prices.length - 1].price;
          entry.latestPrice = lastPrice;
          entry.priceChange = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
          entry.avgPrice = entry.prices.reduce((sum, p) => sum + p.price, 0) / entry.prices.length;
        }

        results.push(entry);
      });

      return results.sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name));
    },
  });
}

// Get delivery performance metrics by supplier
export function useDeliveryPerformance() {
  return useQuery({
    queryKey: ["delivery-performance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(`
          id,
          order_date,
          received_at,
          status,
          supplier_id,
          suppliers(id, name)
        `)
        .order("order_date", { ascending: false });

      if (error) throw error;

      // Group by supplier
      const supplierMap = new Map<string, DeliveryPerformance>();

      data?.forEach((po) => {
        const supplier = po.suppliers as any;
        if (!supplier) return;

        if (!supplierMap.has(po.supplier_id)) {
          supplierMap.set(po.supplier_id, {
            supplier_id: po.supplier_id,
            supplier_name: supplier.name,
            total_orders: 0,
            received_orders: 0,
            avg_delay_days: 0,
            on_time_count: 0,
            late_count: 0,
            on_time_percentage: 0,
            deliveries: [],
          });
        }

        const entry = supplierMap.get(po.supplier_id)!;
        entry.total_orders++;

        let delayDays = 0;
        if (po.received_at) {
          entry.received_orders++;
          delayDays = differenceInDays(new Date(po.received_at), new Date(po.order_date));
          
          // Consider "on time" if received within 3 days of order
          if (delayDays <= 3) {
            entry.on_time_count++;
          } else {
            entry.late_count++;
          }
        }

        entry.deliveries.push({
          po_id: po.id,
          order_date: po.order_date,
          received_at: po.received_at,
          delay_days: delayDays,
          status: po.status,
        });
      });

      // Calculate averages
      const results: DeliveryPerformance[] = [];
      supplierMap.forEach((entry) => {
        if (entry.received_orders > 0) {
          const totalDelay = entry.deliveries
            .filter((d) => d.received_at)
            .reduce((sum, d) => sum + d.delay_days, 0);
          entry.avg_delay_days = totalDelay / entry.received_orders;
          entry.on_time_percentage = (entry.on_time_count / entry.received_orders) * 100;
        }
        results.push(entry);
      });

      return results.sort((a, b) => b.total_orders - a.total_orders);
    },
  });
}
