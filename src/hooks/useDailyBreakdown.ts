import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import { inferItemType, inferDrinkType, type PosItemType, type DrinkType } from "@/lib/posItemClassification";

interface DishMetric {
  name: string;
  quantity: number;
  revenue: number;
}

interface LocationMetric {
  name: string;
  revenue: number;
  orders: number;
}

export interface DailySummary {
  grossSales: number;
  netSales: number;
  vat: number;
  discounts: number;
  orderCount: number | null;
  visitorCount: number | null;
  aov: number | null;
}

export interface RevenueByType {
  food: number;
  alcoholic: number;
  nonAlcoholic: number;
  modifier: number;
  other: number;
}

export interface DailyMetrics {
  date: string; // YYYY-MM-DD
  revenue: number;             // from sales rows (source of truth for revenue)
  qtySold: number;             // total item units sold (product quantity)
  orders: number | null;       // authoritative receipt count from pos_daily_summaries
  aov: number | null;
  visitors: number | null;
  foodCost: number;            // ESTIMATED at 30% unless recipe cost engine takes over
  foodCostIsEstimated: boolean;
  profit: number;              // ESTIMATED profit (revenue - estimated food cost)
  foodCostPercent: number;
  topDishes: DishMetric[];     // Food + Drink only, excludes modifiers/section rows
  worstDishes: DishMetric[];
  allSoldItems: DishMetric[];  // full list for toggles (already filtered for zero-value junk)
  locationPerformance: LocationMetric[];
  revenueByType: RevenueByType;
  summary: DailySummary | null;
  itemsMissingCost: number;    // rough count of sold master dishes lacking a recipe cost
  hasData: boolean;
  hasSummary: boolean;
  hasImported: boolean;
  hasApplied: boolean;
}

interface SaleRow {
  dish_id: string;
  quantity: number;
  total_price: number;
  sale_date: string;
  location_id: string;
  dishes: { name: string; selling_price: number } | null;
  locations: { name: string } | null;
}

// Detect section-header / structural rows that should never appear in Top Dishes
// e.g. "<---Main--->", "---Sides---", "**Drinks**"
function isSectionHeaderName(name: string): boolean {
  const n = (name || "").trim();
  if (!n) return true;
  if (/^[<>\-\*\s]+$/.test(n)) return true;                   // pure symbols
  if (/^<[-–—\s]+.*[-–—\s]+>$/.test(n)) return true;          // <--- ... --->
  if (/^-{2,}.*-{2,}$/.test(n)) return true;                  // --- ... ---
  return false;
}

export function useDailyBreakdown(
  startDate?: string,
  endDate?: string,
  locationId?: string | null
) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  const targetStart = startDate || format(new Date(), "yyyy-MM-dd");
  const targetEnd = endDate || targetStart;
  const locationKey = locationId ?? "all";

  // Sales rows
  const salesQuery = useQuery({
    queryKey: ["daily-breakdown-sales", restaurantId, locationKey, targetStart, targetEnd],
    queryFn: async () => {
      if (!restaurantId) return [] as SaleRow[];
      let q = supabase
        .from("sales")
        .select("dish_id, quantity, total_price, sale_date, location_id, dishes(name, selling_price), locations(name)")
        .eq("restaurant_id", restaurantId)
        .gte("sale_date", targetStart)
        .lte("sale_date", targetEnd)
        .order("sale_date", { ascending: true });
      if (locationId) q = q.eq("location_id", locationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as SaleRow[];
    },
    enabled: !!restaurantId,
  });

  // POS import coverage (staging rows)
  const coverageQuery = useQuery({
    queryKey: ["daily-breakdown-coverage", restaurantId, locationKey, targetStart, targetEnd],
    queryFn: async () => {
      if (!restaurantId) return new Map<string, { imported: boolean; applied: boolean }>();
      let q = supabase
        .from("pos_sales_import")
        .select("mapped_sale_date, sync_status")
        .eq("restaurant_id", restaurantId)
        .gte("mapped_sale_date", targetStart)
        .lte("mapped_sale_date", targetEnd);
      if (locationId) q = q.eq("location_id", locationId);
      const { data } = await q;
      const map = new Map<string, { imported: boolean; applied: boolean }>();
      for (const row of data || []) {
        if (!row.mapped_sale_date) continue;
        const existing = map.get(row.mapped_sale_date) || { imported: false, applied: false };
        existing.imported = true;
        if (row.sync_status === "applied") existing.applied = true;
        map.set(row.mapped_sale_date, existing);
      }
      return map;
    },
    enabled: !!restaurantId,
  });

  // Authoritative daily summaries from Captiva imports (orders/visitors/aov, totals)
  const summariesQuery = useQuery({
    queryKey: ["daily-breakdown-summaries", restaurantId, locationKey, targetStart, targetEnd],
    queryFn: async () => {
      if (!restaurantId) return new Map<string, DailySummary>();
      let q = supabase
        .from("pos_daily_summaries")
        .select("report_date, gross_sales, net_sales, vat_amount, discounts, order_count, visitor_count, average_order_value")
        .eq("restaurant_id", restaurantId)
        .gte("report_date", targetStart)
        .lte("report_date", targetEnd);
      if (locationId) q = q.eq("location_id", locationId);
      const { data } = await q;
      const map = new Map<string, DailySummary>();
      for (const r of (data as any[]) || []) {
        const existing = map.get(r.report_date);
        const s: DailySummary = existing ?? {
          grossSales: 0, netSales: 0, vat: 0, discounts: 0,
          orderCount: null, visitorCount: null, aov: null,
        };
        s.grossSales += Number(r.gross_sales) || 0;
        s.netSales += Number(r.net_sales) || 0;
        s.vat += Number(r.vat_amount) || 0;
        s.discounts += Number(r.discounts) || 0;
        if (r.order_count != null) s.orderCount = (s.orderCount ?? 0) + Number(r.order_count);
        if (r.visitor_count != null) s.visitorCount = (s.visitorCount ?? 0) + Number(r.visitor_count);
        // AOV is derived below from summed order_count & gross to stay accurate
        map.set(r.report_date, s);
      }
      for (const s of map.values()) {
        if (s.orderCount && s.orderCount > 0) s.aov = s.grossSales / s.orderCount;
      }
      return map;
    },
    enabled: !!restaurantId,
  });

  // Classification map dish_id -> {type, drinkType} sourced from external_pos_items
  const classificationQuery = useQuery({
    queryKey: ["daily-breakdown-classification", restaurantId],
    queryFn: async () => {
      const map = new Map<string, { type: PosItemType; drinkType: DrinkType }>();
      if (!restaurantId) return map;
      const { data } = await supabase
        .from("external_pos_items")
        .select("mapped_dish_id, external_item_name, department, manual_type, manual_drink_type")
        .eq("restaurant_id", restaurantId)
        .not("mapped_dish_id", "is", null);
      for (const r of (data as any[]) || []) {
        const t = (r.manual_type as PosItemType | null) ?? inferItemType(r.department, r.external_item_name);
        const d = (r.manual_drink_type as DrinkType | null) ?? inferDrinkType(r.department, r.external_item_name);
        map.set(r.mapped_dish_id, { type: t, drinkType: d });
      }
      return map;
    },
    enabled: !!restaurantId,
  });

  const dailyMetrics = useMemo((): DailyMetrics[] => {
    const days = eachDayOfInterval({
      start: parseISO(targetStart),
      end: parseISO(targetEnd),
    });
    const sales = salesQuery.data || [];
    const coverage = coverageQuery.data || new Map();
    const summaries = summariesQuery.data || new Map<string, DailySummary>();
    const classification = classificationQuery.data || new Map<string, { type: PosItemType; drinkType: DrinkType }>();

    const byDate = new Map<string, SaleRow[]>();
    for (const s of sales) {
      const arr = byDate.get(s.sale_date) || [];
      arr.push(s);
      byDate.set(s.sale_date, arr);
    }

    return days.map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const daySales = byDate.get(dateStr) || [];
      const hasData = daySales.length > 0;
      const summary = summaries.get(dateStr) || null;

      const revenue = daySales.reduce((s, r) => s + Number(r.total_price), 0);
      const qtySold = daySales.reduce((s, r) => s + Number(r.quantity), 0);

      // Aggregate by dish + classify
      const dishMap: Record<string, DishMetric & { type: PosItemType; drinkType: DrinkType }> = {};
      const revenueByType: RevenueByType = { food: 0, alcoholic: 0, nonAlcoholic: 0, modifier: 0, other: 0 };
      const missingCostSet = new Set<string>();

      for (const s of daySales) {
        const key = s.dish_id;
        const name = s.dishes?.name || "Unknown";
        const cls = classification.get(s.dish_id);
        // Fallback classification from the dish name alone if not in external items map
        const type: PosItemType = cls?.type ?? inferItemType(null, name);
        const drinkType: DrinkType = cls?.drinkType ?? inferDrinkType(null, name);

        if (!dishMap[key]) dishMap[key] = { name, quantity: 0, revenue: 0, type, drinkType };
        dishMap[key].quantity += Number(s.quantity);
        dishMap[key].revenue += Number(s.total_price);

        const rev = Number(s.total_price);
        if (type === "modifier") revenueByType.modifier += rev;
        else if (type === "food") revenueByType.food += rev;
        else if (type === "drink") {
          if (drinkType === "alcoholic") revenueByType.alcoholic += rev;
          else if (drinkType === "non_alcoholic") revenueByType.nonAlcoholic += rev;
          else revenueByType.other += rev;
        } else revenueByType.other += rev;

        if (!s.dishes?.selling_price) missingCostSet.add(key);
      }

      const allItems = Object.values(dishMap);
      // Filtered list for Top/Bottom: Food + Drink only, no modifiers, no section rows, revenue > 0
      const rankableItems = allItems.filter((d) =>
        (d.type === "food" || d.type === "drink") &&
        d.revenue > 0 &&
        !isSectionHeaderName(d.name)
      );
      const sorted = [...rankableItems].sort((a, b) => b.revenue - a.revenue);
      const topDishes: DishMetric[] = sorted.slice(0, 5).map(({ name, quantity, revenue }) => ({ name, quantity, revenue }));
      const worstDishes: DishMetric[] = sorted.length > 5
        ? sorted.slice(-5).reverse().map(({ name, quantity, revenue }) => ({ name, quantity, revenue }))
        : [...sorted].reverse().slice(0, 5).map(({ name, quantity, revenue }) => ({ name, quantity, revenue }));
      const allSoldItems: DishMetric[] = allItems
        .filter((d) => d.revenue > 0 && !isSectionHeaderName(d.name))
        .sort((a, b) => b.revenue - a.revenue)
        .map(({ name, quantity, revenue }) => ({ name, quantity, revenue }));

      // Location aggregation
      const locMap: Record<string, LocationMetric> = {};
      for (const s of daySales) {
        const key = s.location_id;
        if (!locMap[key]) locMap[key] = { name: s.locations?.name || "Unknown", revenue: 0, orders: 0 };
        locMap[key].revenue += Number(s.total_price);
        locMap[key].orders += Number(s.quantity);
      }

      // Food cost: still estimated at 30% until recipe engine is wired here
      const foodCostIsEstimated = true;
      const estimatedFoodCostPercent = hasData ? 30 : 0;
      const foodCost = revenue * (estimatedFoodCostPercent / 100);
      const profit = revenue - foodCost;

      const cov = coverage.get(dateStr);
      const orderCount = summary?.orderCount ?? null;
      const visitorCount = summary?.visitorCount ?? null;
      const aov = summary?.aov ?? (orderCount && orderCount > 0 ? revenue / orderCount : null);

      return {
        date: dateStr,
        revenue,
        qtySold,
        orders: orderCount,
        aov,
        visitors: visitorCount,
        foodCost,
        foodCostIsEstimated,
        profit,
        foodCostPercent: hasData && revenue > 0 ? (foodCost / revenue) * 100 : 0,
        topDishes,
        worstDishes,
        allSoldItems,
        locationPerformance: Object.values(locMap).sort((a, b) => b.revenue - a.revenue),
        revenueByType,
        summary,
        itemsMissingCost: missingCostSet.size,
        hasData,
        hasSummary: !!summary,
        hasImported: cov?.imported || false,
        hasApplied: cov?.applied || false,
      };
    });
  }, [salesQuery.data, coverageQuery.data, summariesQuery.data, classificationQuery.data, targetStart, targetEnd]);

  return {
    data: dailyMetrics,
    isLoading:
      salesQuery.isLoading ||
      coverageQuery.isLoading ||
      summariesQuery.isLoading ||
      classificationQuery.isLoading,
  };
}
