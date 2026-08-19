import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { calculateOverheadForRange, type Overhead } from "./useOverheads";
import { normalisePayType, allocateSalaryCost } from "@/lib/labour";

/** Default assumption used ONLY when recipe coverage is too low to be trusted. */
export const ESTIMATED_FOOD_COST_PCT = 30;
const RECIPE_COVERAGE_THRESHOLD = 0.5;

export interface DailyFinancialSummary {
  revenue: number;
  orders: number | null;
  covers: number | null;
  aov: number | null;

  labourCost: number;
  labourHours: number;
  labourPct: number | null;
  labourSource: "attendance" | "manual" | "none";
  /** Hourly staff: worked hours x rate. */
  hourlyLabourCost: number;
  /** Salaried staff: annual salary / 365 x days in period. */
  salariedLabourCost: number;
  labourConfirmed: boolean;

  foodCost: number;
  foodCostPct: number | null;
  foodCostIsEstimated: boolean;
  recipeCoveragePct: number | null;

  purchases: number;
  purchaseOrderCount: number;
  unvaluedSupplierDocs: number;

  dailyExpenses: number;
  dailyExpenseCount: number;

  overheads: number;
  hasOverheads: boolean;

  operatingProfit: number;
  operatingMarginPct: number | null;

  /** Components that are missing/unreliable — profit must be shown as incomplete. */
  missing: string[];
  isComplete: boolean;
}

export function useDailyFinancialSummary(
  startDate: string,
  endDate: string,
  locationId: string | null
) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;

  return useQuery({
    queryKey: [
      "daily-financial-summary",
      restaurantId,
      locationId ?? "all",
      startDate,
      endDate,
    ],
    queryFn: async (): Promise<DailyFinancialSummary> => {
      if (!restaurantId) throw new Error("No restaurant");

      // ---------- Revenue / orders / covers ----------
      let salesQ = supabase
        .from("sales")
        .select("dish_id, quantity, total_price")
        .eq("restaurant_id", restaurantId)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate);
      if (locationId) salesQ = salesQ.eq("location_id", locationId);
      const { data: sales } = await salesQ;

      const revenue = (sales ?? []).reduce((s, r) => s + Number(r.total_price || 0), 0);

      let sumQ = supabase
        .from("pos_daily_summaries")
        .select("order_count, visitor_count")
        .eq("restaurant_id", restaurantId)
        .gte("report_date", startDate)
        .lte("report_date", endDate);
      if (locationId) sumQ = sumQ.eq("location_id", locationId);
      const { data: summaries } = await sumQ;

      let orders: number | null = null;
      let posCovers: number | null = null;
      for (const s of summaries ?? []) {
        if (s.order_count != null) orders = (orders ?? 0) + Number(s.order_count);
        if (s.visitor_count != null) posCovers = (posCovers ?? 0) + Number(s.visitor_count);
      }

      // ---------- Daily ledger (covers fallback + confirmation flags) ----------
      let ledgerQ = supabase
        .from("daily_ledger_entries")
        .select(
          "entry_date, covers, covers_unknown, labour_hours, additional_expenses, labour_confirmed"
        )
        .eq("restaurant_id", restaurantId)
        .gte("entry_date", startDate)
        .lte("entry_date", endDate);
      if (locationId) ledgerQ = ledgerQ.eq("location_id", locationId);
      const { data: ledgers } = await ledgerQ;

      const ledgerCovers = (ledgers ?? []).reduce((s, l) => s + Number(l.covers || 0), 0);
      const covers =
        posCovers != null && posCovers > 0 ? posCovers : ledgerCovers > 0 ? ledgerCovers : null;
      const aov = orders && orders > 0 ? revenue / orders : null;
      const labourConfirmed =
        (ledgers?.length ?? 0) > 0 && (ledgers ?? []).every((l) => l.labour_confirmed === true);

      // ---------- Labour (attendance first, manual ledger fallback) ----------
      let attQ = supabase
        .from("staff_attendance")
        .select("clock_in, clock_out, staff_id")
        .eq("restaurant_id", restaurantId)
        .gte("clock_in", `${startDate}T00:00:00`)
        .lte("clock_in", `${endDate}T23:59:59`);
      if (locationId) attQ = attQ.eq("location_id", locationId);
      const { data: attendance } = await attQ;

      let labourCost = 0;
      let labourHours = 0;
      if (attendance && attendance.length > 0) {
        const staffIds = Array.from(new Set(attendance.map((a) => a.staff_id)));
        const { data: staffRows } = await supabase
          .from("staff_safe")
          .select("id, hourly_rate, pay_type")
          .in("id", staffIds);
        const rates = new Map<string, number>();
        for (const s of staffRows ?? []) {
          const row = s as { id: string; hourly_rate: number | null; pay_type: string | null };
          // Salaried staff are allocated separately — never priced from attendance hours.
          if (normalisePayType(row.pay_type) === "salary") continue;
          if (row.hourly_rate != null) rates.set(row.id, Number(row.hourly_rate));
        }
        for (const a of attendance) {
          if (!a.clock_out) continue;
          const hours =
            (new Date(a.clock_out).getTime() - new Date(a.clock_in).getTime()) / 3_600_000;
          if (hours <= 0) continue;
          labourHours += hours;
          labourCost += hours * (rates.get(a.staff_id) ?? 0);
        }
      }

      let labourSource: DailyFinancialSummary["labourSource"] =
        labourHours > 0 ? "attendance" : "none";
      if (labourHours === 0) {
        const manualHours = (ledgers ?? []).reduce((s, l) => s + Number(l.labour_hours || 0), 0);
        if (manualHours > 0) {
          labourHours = manualHours;
          labourSource = "manual";
        }
      }
      // ---------- Salaried labour allocation ----------
      let salariedQ = supabase
        .from("staff_safe")
        .select("id, annual_salary, pay_type, status, location_id")
        .eq("pay_type", "salary")
        .eq("status", "active");
      if (locationId) salariedQ = salariedQ.eq("location_id", locationId);
      const { data: salariedStaff } = await salariedQ;
      const hourlyLabourCost = labourCost;
      const salariedLabourCost = allocateSalaryCost(
        (salariedStaff ?? []).map((s: any) => ({
          id: s.id,
          annual_salary: s.annual_salary != null ? Number(s.annual_salary) : null,
        })),
        startDate,
        endDate
      );
      labourCost = hourlyLabourCost + salariedLabourCost;

      const labourPct = revenue > 0 && labourCost > 0 ? (labourCost / revenue) * 100 : null;

      // ---------- Food cost (recipe-based, estimate only when labelled) ----------
      const dishQty: Record<string, number> = {};
      for (const s of sales ?? []) {
        if (!s.dish_id) continue;
        dishQty[s.dish_id] = (dishQty[s.dish_id] || 0) + Number(s.quantity || 0);
      }
      const dishIds = Object.keys(dishQty);
      let recipeFoodCost = 0;
      let dishesWithCost = 0;
      for (const dishId of dishIds) {
        try {
          const { data: costData } = await supabase.rpc("calculate_dish_cost", {
            p_dish_id: dishId,
          });
          const cost = Number(costData) || 0;
          if (cost > 0) {
            dishesWithCost++;
            recipeFoodCost += cost * dishQty[dishId];
          }
        } catch {
          /* ignore */
        }
      }
      const recipeCoveragePct =
        dishIds.length > 0 ? (dishesWithCost / dishIds.length) * 100 : null;
      const reliableFoodCost =
        dishIds.length > 0 && dishesWithCost / dishIds.length >= RECIPE_COVERAGE_THRESHOLD;
      const foodCostIsEstimated = !reliableFoodCost;
      const foodCost = reliableFoodCost
        ? recipeFoodCost
        : revenue * (ESTIMATED_FOOD_COST_PCT / 100);
      const foodCostPct = revenue > 0 ? (foodCost / revenue) * 100 : null;

      // ---------- Supplier purchases (received purchase orders only) ----------
      let poQ = supabase
        .from("purchase_orders")
        .select("id, order_date, received_at, status")
        .eq("restaurant_id", restaurantId)
        .gte("order_date", startDate)
        .lte("order_date", endDate);
      if (locationId) poQ = poQ.eq("location_id", locationId);
      const { data: pos } = await poQ;
      const receivedPos = (pos ?? []).filter(
        (p) => p.status === "received" || p.received_at != null
      );
      let purchases = 0;
      if (receivedPos.length > 0) {
        const { data: items } = await supabase
          .from("purchase_order_items")
          .select("purchase_order_id, quantity, cost_price")
          .in(
            "purchase_order_id",
            receivedPos.map((p) => p.id)
          );
        purchases = (items ?? []).reduce(
          (s, i) => s + Number(i.quantity || 0) * Number(i.cost_price || 0),
          0
        );
      }

      // Supplier documents without a confirmed monetary value are informational only
      let docQ = supabase
        .from("documents")
        .select("id, purchase_order_id, extracted_data")
        .eq("restaurant_id", restaurantId)
        .not("supplier_id", "is", null)
        .gte("document_date", startDate)
        .lte("document_date", endDate);
      if (locationId) docQ = docQ.eq("location_id", locationId);
      const { data: docs } = await docQ;
      const unvaluedSupplierDocs = (docs ?? []).filter(
        (d) => d.purchase_order_id == null
      ).length;

      // ---------- Daily expenses ----------
      let expQ = supabase
        .from("daily_expenses")
        .select("amount")
        .eq("restaurant_id", restaurantId)
        .gte("entry_date", startDate)
        .lte("entry_date", endDate);
      if (locationId) expQ = expQ.eq("location_id", locationId);
      const { data: expenses } = await expQ;
      let dailyExpenses = (expenses ?? []).reduce((s, e) => s + Number(e.amount || 0), 0);
      const dailyExpenseCount = expenses?.length ?? 0;
      if (dailyExpenseCount === 0) {
        // compatible ledger fallback
        dailyExpenses = (ledgers ?? []).reduce(
          (s, l) => s + Number(l.additional_expenses || 0),
          0
        );
      }

      // ---------- Recurring overheads (existing allocation engine) ----------
      let ohQ = supabase
        .from("overheads")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true);
      if (locationId) ohQ = ohQ.or(`location_id.eq.${locationId},location_id.is.null`);
      const { data: overheadsRaw } = await ohQ;

      let locationCount = 1;
      if (!locationId) {
        const { count } = await supabase
          .from("locations")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId);
        locationCount = count || 1;
      }
      const overheadRows = (overheadsRaw ?? []).map((o) => ({
        ...o,
        allocation_mode: o.allocation_mode || "equal",
        allocation_details: (o.allocation_details as Record<string, number>) || {},
      })) as Overhead[];
      const overheads = calculateOverheadForRange(
        overheadRows,
        startDate,
        endDate,
        locationId,
        locationCount
      );

      // ---------- Operating profit ----------
      const operatingProfit = revenue - foodCost - labourCost - dailyExpenses - overheads;
      const operatingMarginPct = revenue > 0 ? (operatingProfit / revenue) * 100 : null;

      const missing: string[] = [];
      if (revenue <= 0) missing.push("Revenue");
      if (foodCostIsEstimated) missing.push("Food cost data");
      if (labourCost <= 0) missing.push("Labour cost");
      else if (!labourConfirmed) missing.push("Labour review");
      if ((overheadsRaw?.length ?? 0) === 0) missing.push("Recurring overheads");

      return {
        revenue,
        orders,
        covers,
        aov,
        labourCost,
        labourHours,
        labourPct,
        labourSource,
        hourlyLabourCost,
        salariedLabourCost,
        labourConfirmed,
        foodCost,
        foodCostPct,
        foodCostIsEstimated,
        recipeCoveragePct,
        purchases,
        purchaseOrderCount: receivedPos.length,
        unvaluedSupplierDocs,
        dailyExpenses,
        dailyExpenseCount,
        overheads,
        hasOverheads: (overheadsRaw?.length ?? 0) > 0,
        operatingProfit,
        operatingMarginPct,
        missing,
        isComplete: missing.length === 0,
      };
    },
    enabled: !!restaurantId && !!startDate && !!endDate,
    staleTime: 30_000,
  });
}
