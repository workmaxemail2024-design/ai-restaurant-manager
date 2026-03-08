import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { format, subDays, subWeeks, startOfWeek, endOfWeek, differenceInDays } from "date-fns";

export type InsightType = "trend" | "alert" | "opportunity" | "comparison" | "recommendation";
export type InsightSeverity = "info" | "warning" | "critical" | "positive";
export type InsightConfidence = "high" | "medium" | "low";
export type InsightCategory = "revenue" | "labour" | "food_cost" | "menu" | "customers" | "inventory" | "locations";

export interface OwnerInsight {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  confidence: InsightConfidence;
  category: InsightCategory;
  title: string;
  description: string;
  action?: string;
  metric?: { label: string; value: string; change?: string };
  missingData?: string[];
}

export interface WeeklySummary {
  thisWeek: { revenue: number; orders: number; labourCost: number; foodCost: number };
  lastWeek: { revenue: number; orders: number; labourCost: number; foodCost: number };
  revenueChange: number;
  ordersChange: number;
  labourPctThis: number | null;
  labourPctLast: number | null;
  foodCostPctThis: number | null;
  foodCostPctLast: number | null;
  narrative: string;
  confidence: InsightConfidence;
  missingData: string[];
}

async function fetchPeriodData(restaurantId: string, from: string, to: string, locationId?: string | null) {
  // Sales
  let sq = supabase.from("sales").select("total_price, quantity, dish_id, sale_date, location_id, dishes(name, selling_price)")
    .eq("restaurant_id", restaurantId).gte("sale_date", from).lte("sale_date", to);
  if (locationId) sq = sq.eq("location_id", locationId);
  const { data: sales } = await sq;

  const revenue = (sales || []).reduce((s, r) => s + Number(r.total_price), 0);
  const orders = (sales || []).length;

  // Labour
  let aq = supabase.from("staff_attendance").select("clock_in, clock_out, staff_id, staff(hourly_rate)")
    .eq("restaurant_id", restaurantId).gte("clock_in", `${from}T00:00:00`).lte("clock_in", `${to}T23:59:59`).not("clock_out", "is", null);
  if (locationId) aq = aq.eq("location_id", locationId);
  const { data: attendance } = await aq;

  let labourCost = 0;
  (attendance || []).forEach(r => {
    if (r.clock_in && r.clock_out && r.staff) {
      const hours = (new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 3600000;
      labourCost += hours * (Number((r.staff as any).hourly_rate) || 0);
    }
  });

  // Food cost
  let foodCost = 0;
  const dishQuantities: Record<string, { qty: number; name: string; revenue: number }> = {};
  (sales || []).forEach(s => {
    const name = (s.dishes as any)?.name || "Unknown";
    if (!dishQuantities[s.dish_id]) dishQuantities[s.dish_id] = { qty: 0, name, revenue: 0 };
    dishQuantities[s.dish_id].qty += s.quantity;
    dishQuantities[s.dish_id].revenue += Number(s.total_price);
  });

  for (const [dishId, d] of Object.entries(dishQuantities)) {
    try {
      const { data: costData } = await supabase.rpc("calculate_dish_cost", { p_dish_id: dishId });
      foodCost += (Number(costData) || 0) * d.qty;
    } catch { /* skip */ }
  }

  // Reservations
  let rq = supabase.from("reservations").select("party_size, start_at, status")
    .eq("restaurant_id", restaurantId).gte("start_at", `${from}T00:00:00`).lte("start_at", `${to}T23:59:59`)
    .not("status", "in", '("cancelled","declined","no_show")');
  if (locationId) rq = rq.eq("location_id", locationId);
  const { data: reservations } = await rq;
  const totalCovers = (reservations || []).reduce((s, r) => s + (r.party_size || 0), 0);
  const totalBookings = (reservations || []).length;

  return {
    revenue, orders, labourCost, foodCost,
    hasLabour: (attendance?.length || 0) > 0,
    hasSales: (sales?.length || 0) > 0,
    dishPerformance: dishQuantities,
    totalCovers, totalBookings,
    sales: sales || [],
  };
}

export function useOwnerIntelligence(locationId?: string | null) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  const locationKey = locationId ?? "all";

  return useQuery({
    queryKey: ["owner-intelligence", restaurantId, locationKey],
    queryFn: async (): Promise<{ insights: OwnerInsight[]; weeklySummary: WeeklySummary | null }> => {
      if (!restaurantId) return { insights: [], weeklySummary: null };

      const today = new Date();
      const thisWeekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const thisWeekEnd = format(today, "yyyy-MM-dd");
      const lastWeekStart = format(startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }), "yyyy-MM-dd");
      const lastWeekEnd = format(endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }), "yyyy-MM-dd");
      const twoWeeksAgoStart = format(startOfWeek(subWeeks(today, 2), { weekStartsOn: 1 }), "yyyy-MM-dd");
      const twoWeeksAgoEnd = format(endOfWeek(subWeeks(today, 2), { weekStartsOn: 1 }), "yyyy-MM-dd");

      const [thisWeekData, lastWeekData, twoWeeksAgoData] = await Promise.all([
        fetchPeriodData(restaurantId, thisWeekStart, thisWeekEnd, locationId),
        fetchPeriodData(restaurantId, lastWeekStart, lastWeekEnd, locationId),
        fetchPeriodData(restaurantId, twoWeeksAgoStart, twoWeeksAgoEnd, locationId),
      ]);

      const insights: OwnerInsight[] = [];
      const missingData: string[] = [];

      if (!lastWeekData.hasSales) missingData.push("Last week sales");
      if (!lastWeekData.hasLabour) missingData.push("Last week labour");

      // --- WEEKLY SUMMARY ---
      let weeklySummary: WeeklySummary | null = null;
      if (lastWeekData.hasSales) {
        const revChange = lastWeekData.revenue > 0 ? ((thisWeekData.revenue - lastWeekData.revenue) / lastWeekData.revenue) * 100 : 0;
        const ordChange = lastWeekData.orders > 0 ? ((thisWeekData.orders - lastWeekData.orders) / lastWeekData.orders) * 100 : 0;
        const labPctThis = thisWeekData.revenue > 0 ? (thisWeekData.labourCost / thisWeekData.revenue) * 100 : null;
        const labPctLast = lastWeekData.revenue > 0 ? (lastWeekData.labourCost / lastWeekData.revenue) * 100 : null;
        const fcPctThis = thisWeekData.revenue > 0 ? (thisWeekData.foodCost / thisWeekData.revenue) * 100 : null;
        const fcPctLast = lastWeekData.revenue > 0 ? (lastWeekData.foodCost / lastWeekData.revenue) * 100 : null;

        const parts: string[] = [];
        if (Math.abs(revChange) > 1) {
          parts.push(`Revenue ${revChange > 0 ? "increased" : "decreased"} ${Math.abs(revChange).toFixed(0)}% compared to last week`);
        } else {
          parts.push("Revenue remained stable compared to last week");
        }
        if (labPctThis !== null && labPctLast !== null) {
          const labDiff = labPctThis - labPctLast;
          if (Math.abs(labDiff) > 2) parts.push(`labour ${labDiff > 0 ? "rose" : "dropped"} by ${Math.abs(labDiff).toFixed(1)}pp`);
          else parts.push("labour remained stable");
        }
        if (fcPctThis !== null && fcPctLast !== null) {
          const fcDiff = fcPctThis - fcPctLast;
          if (Math.abs(fcDiff) > 2) parts.push(`food cost ${fcDiff > 0 ? "increased" : "decreased"} by ${Math.abs(fcDiff).toFixed(1)}pp`);
        }

        const confidence: InsightConfidence = missingData.length === 0 ? "high" : missingData.length <= 1 ? "medium" : "low";

        weeklySummary = {
          thisWeek: { revenue: thisWeekData.revenue, orders: thisWeekData.orders, labourCost: thisWeekData.labourCost, foodCost: thisWeekData.foodCost },
          lastWeek: { revenue: lastWeekData.revenue, orders: lastWeekData.orders, labourCost: lastWeekData.labourCost, foodCost: lastWeekData.foodCost },
          revenueChange: revChange,
          ordersChange: ordChange,
          labourPctThis: labPctThis,
          labourPctLast: labPctLast,
          foodCostPctThis: fcPctThis,
          foodCostPctLast: fcPctLast,
          narrative: parts.join(" while ") + ".",
          confidence,
          missingData,
        };
      }

      // --- TREND DETECTION ---
      // Revenue trend (3 weeks)
      if (twoWeeksAgoData.hasSales && lastWeekData.hasSales) {
        const trend1 = lastWeekData.revenue - twoWeeksAgoData.revenue;
        const trend2 = thisWeekData.revenue - lastWeekData.revenue;
        if (trend1 > 0 && trend2 > 0) {
          insights.push({
            id: "trend-rev-up", type: "trend", severity: "positive", confidence: "high", category: "revenue",
            title: "Revenue Trending Up",
            description: "Revenue has increased for 3 consecutive weeks.",
            action: "Maintain momentum — review what's driving growth and double down.",
          });
        } else if (trend1 < 0 && trend2 < 0) {
          insights.push({
            id: "trend-rev-down", type: "trend", severity: "warning", confidence: "high", category: "revenue",
            title: "Revenue Declining",
            description: "Revenue has decreased for 3 consecutive weeks.",
            action: "Investigate potential causes — review menu pricing, marketing, or local competition.",
          });
        }
      }

      // Labour % trend
      if (lastWeekData.hasLabour && thisWeekData.hasLabour && lastWeekData.revenue > 0 && thisWeekData.revenue > 0) {
        const labPctThis = (thisWeekData.labourCost / thisWeekData.revenue) * 100;
        const labPctLast = (lastWeekData.labourCost / lastWeekData.revenue) * 100;
        if (labPctThis > 35) {
          insights.push({
            id: "alert-labour-high", type: "alert", severity: "warning", confidence: "high", category: "labour",
            title: "Labour % Above Target",
            description: `Labour is at ${labPctThis.toFixed(1)}% of revenue — above the 35% healthy threshold.`,
            action: "Review shift schedules and consider adjusting staffing on slower days.",
            metric: { label: "Labour %", value: `${labPctThis.toFixed(1)}%`, change: `${(labPctThis - labPctLast).toFixed(1)}pp vs last week` },
          });
        }
        if (labPctThis - labPctLast > 3) {
          insights.push({
            id: "trend-labour-up", type: "trend", severity: "warning", confidence: "medium", category: "labour",
            title: "Labour Cost Rising",
            description: `Labour % increased ${(labPctThis - labPctLast).toFixed(1)}pp this week compared to last.`,
            action: "Consider adjusting staffing levels on Monday evenings and quiet periods.",
          });
        }
      }

      // Food cost alert
      if (thisWeekData.revenue > 0 && thisWeekData.foodCost > 0) {
        const fcPct = (thisWeekData.foodCost / thisWeekData.revenue) * 100;
        if (fcPct > 35) {
          insights.push({
            id: "alert-fc-high", type: "alert", severity: "warning", confidence: "medium", category: "food_cost",
            title: "Food Cost Above Target",
            description: `Food cost is ${fcPct.toFixed(1)}% — above the recommended 30–35% range.`,
            action: "Review pricing for low-margin dishes and check ingredient costs for recent increases.",
            metric: { label: "Food Cost %", value: `${fcPct.toFixed(1)}%` },
          });
        }
      }

      // --- MENU PERFORMANCE ---
      const dishEntries = Object.entries(lastWeekData.dishPerformance);
      if (dishEntries.length > 0) {
        const sorted = [...dishEntries].sort((a, b) => b[1].revenue - a[1].revenue);
        const topDish = sorted[0];
        if (topDish) {
          insights.push({
            id: "menu-top", type: "opportunity", severity: "positive", confidence: "high", category: "menu",
            title: `Top Performer: ${topDish[1].name}`,
            description: `${topDish[1].name} generated the highest revenue last week with ${topDish[1].qty} orders.`,
            action: "Consider featuring this dish prominently and training staff to upsell it.",
          });
        }

        // Low sellers
        const lowSellers = sorted.filter(([, d]) => d.qty <= 2);
        if (lowSellers.length > 0) {
          insights.push({
            id: "menu-low", type: "alert", severity: "info", confidence: "medium", category: "menu",
            title: `${lowSellers.length} Dishes Rarely Sell`,
            description: `${lowSellers.slice(0, 3).map(([, d]) => d.name).join(", ")} had very few orders last week.`,
            action: "Consider removing or refreshing these dishes to simplify the menu.",
          });
        }
      }

      // --- CUSTOMER BEHAVIOUR ---
      if (lastWeekData.totalBookings > 0) {
        // Day of week distribution
        const dayBookings: Record<number, number> = {};
        (lastWeekData.sales || []).forEach(s => {
          const dow = new Date(s.sale_date).getDay();
          dayBookings[dow] = (dayBookings[dow] || 0) + 1;
        });
        const busiestDay = Object.entries(dayBookings).sort((a, b) => b[1] - a[1])[0];
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        if (busiestDay) {
          insights.push({
            id: "customer-busiest", type: "trend", severity: "info", confidence: "high", category: "customers",
            title: `${dayNames[Number(busiestDay[0])]} is Busiest`,
            description: `${dayNames[Number(busiestDay[0])]} consistently has the highest order volume.`,
            action: "Ensure adequate staffing and inventory for this day.",
          });
        }

        if (lastWeekData.totalBookings > twoWeeksAgoData.totalBookings * 1.1) {
          insights.push({
            id: "customer-growth", type: "trend", severity: "positive", confidence: "medium", category: "customers",
            title: "Booking Demand Growing",
            description: `Reservations increased from ${twoWeeksAgoData.totalBookings} to ${lastWeekData.totalBookings} week over week.`,
          });
        } else if (lastWeekData.totalBookings < twoWeeksAgoData.totalBookings * 0.8 && twoWeeksAgoData.totalBookings > 5) {
          insights.push({
            id: "customer-drop", type: "alert", severity: "warning", confidence: "medium", category: "customers",
            title: "Reservation Drop Detected",
            description: `Bookings fell from ${twoWeeksAgoData.totalBookings} to ${lastWeekData.totalBookings}.`,
            action: "Consider promotional offers or outreach to previous guests.",
          });
        }
      }

      // --- INVENTORY ALERTS ---
      const { data: lowStock } = await (async () => {
        let q = supabase.from("stock_levels").select("quantity, ingredient_id, ingredients(name)")
          .eq("restaurant_id", restaurantId);
        if (locationId) q = q.eq("location_id", locationId);
        const { data } = await q;
        return { data: (data || []).filter(s => Number(s.quantity) < 5 && Number(s.quantity) >= 0) };
      })();

      if (lowStock.length > 0) {
        insights.push({
          id: "inv-low", type: "alert", severity: "warning", confidence: "high", category: "inventory",
          title: `${lowStock.length} Items Near Stockout`,
          description: `${lowStock.slice(0, 3).map(s => (s.ingredients as any)?.name).filter(Boolean).join(", ")} are running critically low.`,
          action: "Create purchase orders for these items to avoid service disruption.",
        });
      }

      // --- LOCATION COMPARISON ---
      if (!locationId) {
        const { data: locations } = await supabase.from("locations").select("id, name").eq("restaurant_id", restaurantId);
        if (locations && locations.length >= 2) {
          const locData = await Promise.all(
            locations.slice(0, 4).map(async loc => {
              const d = await fetchPeriodData(restaurantId, lastWeekStart, lastWeekEnd, loc.id);
              return { ...d, name: loc.name, id: loc.id };
            })
          );
          const withRevenue = locData.filter(l => l.revenue > 0).sort((a, b) => b.revenue - a.revenue);
          if (withRevenue.length >= 2) {
            const top = withRevenue[0];
            const bottom = withRevenue[withRevenue.length - 1];
            const diff = top.revenue > 0 ? ((top.revenue - bottom.revenue) / top.revenue) * 100 : 0;
            insights.push({
              id: "loc-compare", type: "comparison", severity: "info", confidence: "high", category: "locations",
              title: "Location Performance Gap",
              description: `${top.name} outperformed ${bottom.name} by ${diff.toFixed(0)}% in revenue last week.`,
              action: "Investigate what's working at the top location and replicate those practices.",
            });

            // Labour efficiency comparison
            const topLabPct = top.revenue > 0 ? (top.labourCost / top.revenue) * 100 : null;
            const bottomLabPct = bottom.revenue > 0 ? (bottom.labourCost / bottom.revenue) * 100 : null;
            if (topLabPct !== null && bottomLabPct !== null && Math.abs(topLabPct - bottomLabPct) > 5) {
              const moreEfficient = topLabPct < bottomLabPct ? top : bottom;
              const lessEfficient = topLabPct < bottomLabPct ? bottom : top;
              insights.push({
                id: "loc-labour", type: "comparison", severity: "info", confidence: "medium", category: "locations",
                title: "Labour Efficiency Varies",
                description: `${lessEfficient.name} has ${Math.abs(topLabPct - bottomLabPct).toFixed(1)}pp higher labour % than ${moreEfficient.name}.`,
                action: `Review staffing schedules at ${lessEfficient.name} for optimisation opportunities.`,
              });
            }
          }
        }
      }

      // --- PROFIT TREND ---
      if (lastWeekData.hasSales && twoWeeksAgoData.hasSales) {
        const profitThis = thisWeekData.revenue - thisWeekData.foodCost - thisWeekData.labourCost;
        const profitLast = lastWeekData.revenue - lastWeekData.foodCost - lastWeekData.labourCost;
        const profitPrev = twoWeeksAgoData.revenue - twoWeeksAgoData.foodCost - twoWeeksAgoData.labourCost;
        if (profitLast < profitPrev && profitThis < profitLast) {
          insights.push({
            id: "trend-profit-down", type: "alert", severity: "critical", confidence: lastWeekData.hasLabour ? "high" : "low",
            category: "revenue",
            title: "Profit Declining",
            description: "Estimated profit has dropped for 3 consecutive weeks.",
            action: "Review both revenue drivers and cost controls urgently.",
            missingData: !lastWeekData.hasLabour ? ["Labour data"] : undefined,
          });
        }
      }

      // Add data reliability warnings
      insights.forEach(insight => {
        if (!lastWeekData.hasLabour && ["labour", "revenue"].includes(insight.category)) {
          insight.confidence = insight.confidence === "high" ? "medium" : "low";
          insight.missingData = [...(insight.missingData || []), "Labour data"];
        }
      });

      // Sort: critical first, then warnings, then info
      const severityOrder: Record<InsightSeverity, number> = { critical: 0, warning: 1, positive: 2, info: 3 };
      insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

      return { insights, weeklySummary };
    },
    enabled: !!restaurantId,
    staleTime: 120000, // 2 min cache
    refetchOnWindowFocus: false,
  });
}
