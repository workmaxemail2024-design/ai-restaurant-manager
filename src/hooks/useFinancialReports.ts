import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchSalesPaged } from "@/lib/canonicalRevenueLoader";
import { dedupePosSales, profitEstimateReasons, recipeFoodCost, sumRevenue } from "@/lib/revenueTruth";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocation } from "@/contexts/LocationContext";
import { startOfMonth, endOfMonth, format, subMonths } from "date-fns";
import { fetchSalaryAllocation, isSalariedStaffRow } from "@/hooks/useLabourCost";
import { aggregateReceivedByMonth, pnlMonths, type ReceivedDayRow } from "@/lib/receivedGross";
import { useLocations } from "@/hooks/useLocations";

export interface ProfitLossData {
  month: string;
  /** yyyy-MM */
  monthKey?: string;
  /** Gross takings (incl. VAT) from sales; 0 with revenueKnown=false when no sales rows. */
  revenue: number;
  revenueKnown?: boolean;
  /** Non-empty when profit is an estimate (missing costs/rates/sales). */
  estimateReasons?: string[];
  foodCost: number;
  /** Dishes sold this month whose recipe cost is unknown (excluded from foodCost). */
  uncostedDishCount?: number;
  /** Hourly staff with attendance but no pay rate (their labour is not included). */
  missingPayRateStaff?: number;
  labourCost: number;
  overheads: number;
  grossProfit: number;
  netProfit: number;
  grossMargin: number;
  netMargin: number;
}

export interface CashFlowData {
  month: string;
  cashIn: number; // Revenue from sales
  cashOutPayroll: number;
  cashOutOverheads: number;
  cashOutTotal: number;
  netCashFlow: number;
}

// Helper to convert overhead frequency to monthly amount
function toMonthlyAmount(amount: number, frequency: string): number {
  switch (frequency) {
    case "daily":
      return amount * 30;
    case "weekly":
      return amount * 4.33;
    case "monthly":
    default:
      return amount;
  }
}

const fetchMonthSales = fetchSalesPaged;

export function useMonthlyProfitLoss(range: number | "ytd" = 6) {
  const monthsBack = range === "ytd" ? new Date().getMonth() + 1 : range;
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const restaurantId = currentRestaurant?.id;

  return useQuery({
    queryKey: ["monthly-pnl", restaurantId, selectedLocationId ?? "all", range, monthsBack],
    queryFn: async () => {
      if (!restaurantId) return [];

      const results: ProfitLossData[] = [];
      const now = new Date();

      for (let i = monthsBack - 1; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        const monthLabel = format(monthDate, "MMM yyyy");

        // Fetch sales for the month (all pages; errors are shown, never read as €0)
        const rawSales = await fetchMonthSales(restaurantId, selectedLocationId ?? null,
          format(monthStart, "yyyy-MM-dd"), format(monthEnd, "yyyy-MM-dd"),
          "total_price, dish_id, quantity, location_id, sale_date, source");
        const sales = dedupePosSales(rawSales);
        const revenueOrNull = sumRevenue(sales);
        const revenue = revenueOrNull ?? 0;

        // Recipe food cost from summed quantities (not row counts). Dishes with
        // unknown cost are counted as uncosted — never priced at €0.
        const costByDish = new Map<string, number | null>();
        for (const dishId of [...new Set(sales.map((s) => s.dish_id).filter(Boolean))] as string[]) {
          const { data: costData, error: costErr } = await supabase.rpc("calculate_dish_cost", { p_dish_id: dishId });
          if (costErr) throw new Error(`Could not load dish cost: ${costErr.message}`);
          costByDish.set(dishId, costData == null ? null : Number(costData));
        }
        const fc = recipeFoodCost(sales, costByDish);
        const foodCost = fc.cost ?? 0;
        const uncostedDishCount = fc.uncostedDishIds.length;

        // Fetch labour cost from staff attendance
        let attendanceQuery = supabase
          .from("staff_attendance")
          .select("clock_in, clock_out, staff_id, staff(hourly_rate, pay_type, annual_salary)")
          .eq("restaurant_id", restaurantId)
          .gte("clock_in", monthStart.toISOString())
          .lte("clock_in", monthEnd.toISOString());

        if (selectedLocationId) {
          attendanceQuery = attendanceQuery.eq("location_id", selectedLocationId);
        }

        const { data: attendance, error: attErr } = await attendanceQuery;
        if (attErr) throw new Error(`Could not load attendance: ${attErr.message}`);
        let labourCost = 0;
        const missingRate = new Set<string>();
        attendance?.forEach((att) => {
          if (att.clock_in && att.clock_out && !isSalariedStaffRow(att.staff)) {
            // Exact hours (not truncated to whole hours).
            const hours = (new Date(att.clock_out).getTime() - new Date(att.clock_in).getTime()) / 3_600_000;
            const rate = Number((att.staff as any)?.hourly_rate);
            if (!Number.isFinite(rate) || rate <= 0) { missingRate.add(att.staff_id); return; }
            if (hours > 0) labourCost += hours * rate;
          }
        });
        const missingPayRateStaff = missingRate.size;
        labourCost += (
          await fetchSalaryAllocation(
            restaurantId,
            selectedLocationId ?? null,
            format(monthStart, "yyyy-MM-dd"),
            format(monthEnd, "yyyy-MM-dd")
          )
        ).total;

        // Fetch overheads
        let overheadsQuery = supabase
          .from("overheads")
          .select("amount, frequency, is_active, start_date, end_date, location_id")
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true);

        const { data: overheadsData, error: ohErr } = await overheadsQuery;
        if (ohErr) throw new Error(`Could not load overheads: ${ohErr.message}`);
        let overheads = 0;
        overheadsData?.forEach((oh) => {
          // Check if overhead applies to selected location
          if (selectedLocationId && oh.location_id && oh.location_id !== selectedLocationId) {
            return;
          }
          // Check date range
          if (oh.start_date && new Date(oh.start_date) > monthEnd) return;
          if (oh.end_date && new Date(oh.end_date) < monthStart) return;

          overheads += toMonthlyAmount(Number(oh.amount), oh.frequency);
        });

        const grossProfit = revenue - foodCost;
        const netProfit = grossProfit - labourCost - overheads;
        const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
        const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

        results.push({
          month: monthLabel,
          monthKey: format(monthDate, "yyyy-MM"),
          revenue,
          revenueKnown: revenueOrNull != null,
          estimateReasons: profitEstimateReasons({ revenue: revenueOrNull, uncostedDishCount, missingPayRateStaff }),
          foodCost,
          uncostedDishCount,
          missingPayRateStaff,
          labourCost,
          overheads,
          grossProfit,
          netProfit,
          grossMargin,
          netMargin,
        });
      }

      return results;
    },
    enabled: !!restaurantId,
  });
}

export function useCashFlowSummary(monthsBack: number = 6) {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const restaurantId = currentRestaurant?.id;

  return useQuery({
    queryKey: ["cash-flow", restaurantId, selectedLocationId, monthsBack],
    queryFn: async () => {
      if (!restaurantId) return [];

      const results: CashFlowData[] = [];
      const now = new Date();

      for (let i = monthsBack - 1; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        const monthLabel = format(monthDate, "MMM yyyy");

        // Cash In: Sales revenue (all pages; errors surfaced)
        const rawSales = await fetchMonthSales(restaurantId, selectedLocationId ?? null,
          format(monthStart, "yyyy-MM-dd"), format(monthEnd, "yyyy-MM-dd"), "total_price, location_id, sale_date, source");
        const sales = dedupePosSales(rawSales);
        const cashIn = sumRevenue(sales) ?? 0;

        // Cash Out: Payroll from attendance
        let attendanceQuery = supabase
          .from("staff_attendance")
          .select("clock_in, clock_out, staff(hourly_rate, pay_type, annual_salary)")
          .eq("restaurant_id", restaurantId)
          .gte("clock_in", monthStart.toISOString())
          .lte("clock_in", monthEnd.toISOString());

        if (selectedLocationId) {
          attendanceQuery = attendanceQuery.eq("location_id", selectedLocationId);
        }

        const { data: attendance, error: attErr } = await attendanceQuery;
        if (attErr) throw new Error(`Could not load attendance: ${attErr.message}`);
        let cashOutPayroll = 0;
        attendance?.forEach((att) => {
          if (att.clock_in && att.clock_out && !isSalariedStaffRow(att.staff)) {
            const hours = (new Date(att.clock_out).getTime() - new Date(att.clock_in).getTime()) / 3_600_000;
            const rate = (att.staff as any)?.hourly_rate || 0;
            cashOutPayroll += hours * rate;
          }
        });
        cashOutPayroll += (
          await fetchSalaryAllocation(
            restaurantId,
            selectedLocationId ?? null,
            format(monthStart, "yyyy-MM-dd"),
            format(monthEnd, "yyyy-MM-dd")
          )
        ).total;

        // Cash Out: Overheads
        let overheadsQuery = supabase
          .from("overheads")
          .select("amount, frequency, is_active, start_date, end_date, location_id")
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true);

        const { data: overheadsData, error: ohErr } = await overheadsQuery;
        if (ohErr) throw new Error(`Could not load overheads: ${ohErr.message}`);
        let cashOutOverheads = 0;
        overheadsData?.forEach((oh) => {
          if (selectedLocationId && oh.location_id && oh.location_id !== selectedLocationId) {
            return;
          }
          if (oh.start_date && new Date(oh.start_date) > monthEnd) return;
          if (oh.end_date && new Date(oh.end_date) < monthStart) return;

          cashOutOverheads += toMonthlyAmount(Number(oh.amount), oh.frequency);
        });

        const cashOutTotal = cashOutPayroll + cashOutOverheads;
        const netCashFlow = cashIn - cashOutTotal;

        results.push({
          month: monthLabel,
          cashIn,
          cashOutPayroll,
          cashOutOverheads,
          cashOutTotal,
          netCashFlow,
        });
      }

      return results;
    },
    enabled: !!restaurantId,
  });
}

/** Official Captiva gross received per month — read-only, never added to posted revenue. */
export function useReceivedGrossByMonth(range: number | "ytd" = 6) {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const { data: locations = [] } = useLocations();
  const restaurantId = currentRestaurant?.id;
  const months = pnlMonths(range);
  const locationCount = selectedLocationId ? 1 : locations.length;
  return useQuery({
    queryKey: ["received-gross-by-month", restaurantId, selectedLocationId ?? "all", range, months[0], months[months.length - 1], locationCount],
    enabled: !!restaurantId && locationCount > 0,
    queryFn: async () => {
      const start = `${months[0]}-01`;
      const last = months[months.length - 1];
      const [y, m] = last.split("-").map(Number);
      const end = `${last}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
      const rows: ReceivedDayRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        let q = supabase.from("captiva_location_days").select("location_id, trading_date, official_gross")
          .eq("restaurant_id", restaurantId!).gte("trading_date", start).lte("trading_date", end)
          .order("trading_date").order("location_id").range(offset, offset + 999);
        if (selectedLocationId) q = q.eq("location_id", selectedLocationId);
        const { data, error } = await q;
        if (error) throw new Error(`Could not load Captiva gross: ${error.message}`);
        rows.push(...(data as ReceivedDayRow[]));
        if (data.length < 1000) break;
      }
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      return aggregateReceivedByMonth(rows, months, locationCount, today);
    },
  });
}
