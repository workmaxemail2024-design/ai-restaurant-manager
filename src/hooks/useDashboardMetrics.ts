import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface DishMetric { name: string; quantity: number; revenue: number }
interface LocationMetric { name: string; revenue: number; orders: number }

export interface DashboardMetrics {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  foodCostPercent: number;
  totalProfit: number;
  topDishes: DishMetric[];
  worstDishes: DishMetric[];
  locationPerformance: LocationMetric[];
}

export function useDashboardMetrics(date?: string) {
  const targetDate = date || new Date().toISOString().split("T")[0];
  
  return useQuery({
    queryKey: ["dashboard-metrics", targetDate],
    queryFn: async (): Promise<DashboardMetrics> => {
      // Get sales for the date
      const { data: sales } = await supabase
        .from("sales")
        .select("*, dishes(name, selling_price), locations(name)")
        .eq("sale_date", targetDate);
      
      const totalRevenue = sales?.reduce((sum, sale) => sum + Number(sale.total_price), 0) || 0;
      const totalOrders = sales?.reduce((sum, sale) => sum + sale.quantity, 0) || 0;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      
      // Calculate food cost (sum of dish costs * quantity)
      let totalCost = 0;
      if (sales) {
        for (const sale of sales) {
          const { data: costData } = await supabase.rpc("calculate_dish_cost", { p_dish_id: sale.dish_id });
          totalCost += (costData || 0) * sale.quantity;
        }
      }
      
      const foodCostPercent = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;
      const totalProfit = totalRevenue - totalCost;
      
      // Top dishes by quantity
      const dishSales: Record<string, DishMetric> = {};
      sales?.forEach((sale) => {
        const key = sale.dish_id;
        if (!dishSales[key]) {
          dishSales[key] = { name: (sale.dishes as { name: string })?.name || "Unknown", quantity: 0, revenue: 0 };
        }
        dishSales[key].quantity += sale.quantity;
        dishSales[key].revenue += Number(sale.total_price);
      });
      
      const sortedDishes = Object.values(dishSales).sort((a, b) => b.quantity - a.quantity);
      const topDishes = sortedDishes.slice(0, 5);
      const worstDishes = sortedDishes.slice(-5).reverse();
      
      // Location performance
      const locationSales: Record<string, LocationMetric> = {};
      sales?.forEach((sale) => {
        const key = sale.location_id;
        if (!locationSales[key]) {
          locationSales[key] = { name: (sale.locations as { name: string })?.name || "Unknown", revenue: 0, orders: 0 };
        }
        locationSales[key].revenue += Number(sale.total_price);
        locationSales[key].orders += sale.quantity;
      });
      
      const locationPerformance = Object.values(locationSales).sort((a, b) => b.revenue - a.revenue);
      
      return {
        totalRevenue,
        totalOrders,
        avgOrderValue,
        foodCostPercent,
        totalProfit,
        topDishes,
        worstDishes,
        locationPerformance,
      };
    },
  });
}
