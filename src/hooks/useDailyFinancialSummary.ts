import { unwrapQuery } from "@/lib/revenueTruth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { calculateOverheadForRange, type Overhead } from "./useOverheads";
import { normalisePayType, allocateSalaryCost } from "@/lib/labour";
import { effectiveOrdersAndCovers, marginBase } from "@/lib/revenueTruth";
import { loadCanonicalRevenue } from "@/lib/canonicalRevenueLoader";
import { getManualLabourRate, manualLabourCost } from "@/lib/labourRate";

/** Default assumption used ONLY when recipe coverage is too low to be trusted. */
export const ESTIMATED_FOOD_COST_PCT = 30;
const RECIPE_COVERAGE_THRESHOLD = 0.5;

export interface DailyFinancialSummary {
  /** Gross takings incl. VAT (canonical per location/day). */
  revenue: number;
  /** False = no revenue recorded (Unknown, not €0). */
  revenueKnown: boolean;
  /** Net of VAT, only when known for every location/day (never derived). */
  revenueNet: number | null;
  vat: number | null;
  netCoverage: "full" | "partial" | "none";
  /** Base used for %s and profit: net when fully known, else gross. */
  marginBasis: "net" | "gross";
  revenueSources: { pos_summary: number; sales: number; manual: number };
  /** not_entered = no wages recorded at all (not €0); partial = some hours unpriced. */
  labourStatus: "entered" | "partial" | "not_entered";
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
  /** Hourly staff with worked hours but no pay rate — their cost is unknown, not €0. */
  missingPayRateStaff: number;
  /** Dishes sold in the period with no recipe cost (excluded from recipe food cost). */
  uncostedDishCount: number;
  /** Revenue from those uncosted dishes. */
  uncostedRevenue: number;

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
      // Canonical per location+day (same rule as Dashboard and Reports).
      const load = await loadCanonicalRevenue(restaurantId, locationId, startDate, endDate, {
        salesColumns: "dish_id, quantity, total_price, location_id, sale_date, source",
        ledgerColumns: "entry_date, location_id, manual_revenue, manual_orders, covers, covers_unknown, labour_hours, additional_expenses, labour_confirmed",
      });
      const sales = load.sales;
      const canonicalDays = load.posDays;
      const ledgers = load.ledger;
      const revenueSummary = load.revenue;
      const revenueKnown = revenueSummary.gross != null;
      const revenue = revenueSummary.gross ?? 0;
      // Margins use VAT-exclusive net sales only when known for every location/day.
      const mb = marginBase(revenueSummary);
      const marginRevenue = mb.base ?? 0;

      // Same per-location manual-correction rule as the Dashboard and Reports.
      const { orders, covers } = effectiveOrdersAndCovers(canonicalDays, (ledgers as any[]) ?? []);
      const aov = orders && orders > 0 && revenueKnown ? revenue / orders : null;
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
      const attendance = unwrapQuery(await attQ, "attendance");

      let labourCost = 0;
      let labourHours = 0;
      const missingRateIds = new Set<string>();
      const salariedIds = new Set<string>();
      if (attendance && attendance.length > 0) {
        const staffIds = Array.from(new Set(attendance.map((a) => a.staff_id)));
        const staffRows = unwrapQuery(await supabase
          .from("staff_safe")
          .select("id, hourly_rate, pay_type")
          .in("id", staffIds), "staffRows");
        const rates = new Map<string, number>();
        for (const s of staffRows ?? []) {
          const row = s as { id: string; hourly_rate: number | null; pay_type: string | null };
          // Salaried staff are allocated separately — never priced from attendance hours.
          if (normalisePayType(row.pay_type) === "salary") { salariedIds.add(row.id); continue; }
          if (row.hourly_rate != null) rates.set(row.id, Number(row.hourly_rate));
        }
        for (const a of attendance) {
          if (!a.clock_out) continue;
          const hours =
            (new Date(a.clock_out).getTime() - new Date(a.clock_in).getTime()) / 3_600_000;
          if (hours <= 0) continue;
          labourHours += hours;
          const rate = rates.get(a.staff_id);
          if (rate == null || rate <= 0) { if (!salariedIds.has(a.staff_id)) missingRateIds.add(a.staff_id); continue; }
          labourCost += hours * rate;
        }
      }

      let manualRateMissing = false;
      let labourSource: DailyFinancialSummary["labourSource"] =
        labourHours > 0 ? "attendance" : "none";
      if (labourHours === 0) {
        const manualHours = (ledgers ?? []).reduce((s, l) => s + Number(l.labour_hours || 0), 0);
        if (manualHours > 0) {
          labourHours = manualHours;
          labourSource = "manual";
          // Manual hours are priced only with the user-set rate; otherwise Unknown.
          const c = manualLabourCost(manualHours, getManualLabourRate(restaurantId));
          if (c == null) manualRateMissing = true;
          else labourCost += c;
        }
      }
      // ---------- Salaried labour allocation ----------
      let salariedQ = supabase
        .from("staff_safe")
        .select("id, annual_salary, pay_type, status, location_id")
        .eq("restaurant_id", restaurantId)
        .eq("pay_type", "salary")
        .eq("status", "active");
      if (locationId) salariedQ = salariedQ.eq("location_id", locationId);
      const salariedStaff = unwrapQuery(await salariedQ, "salariedStaff");
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

      const labourPct = marginRevenue > 0 && labourCost > 0 && !manualRateMissing ? (labourCost / marginRevenue) * 100 : null;

      // ---------- Food cost (recipe-based, estimate only when labelled) ----------
      const dishQty: Record<string, number> = {};
      for (const s of sales ?? []) {
        if (!s.dish_id) continue;
        dishQty[s.dish_id] = (dishQty[s.dish_id] || 0) + Number(s.quantity || 0);
      }
      const dishIds = Object.keys(dishQty);
      let recipeFoodCost = 0;
      let dishesWithCost = 0;
      const uncostedIds = new Set<string>();
      for (const dishId of dishIds) {
        try {
          const costData = unwrapQuery(await supabase.rpc("calculate_dish_cost", {
            p_dish_id: dishId,
          }), "costData");
          const cost = Number(costData) || 0;
          if (cost > 0) {
            dishesWithCost++;
            recipeFoodCost += cost * dishQty[dishId];
          } else {
            uncostedIds.add(dishId);
          }
        } catch {
          uncostedIds.add(dishId);
        }
      }
      const recipeCoveragePct =
        dishIds.length > 0 ? (dishesWithCost / dishIds.length) * 100 : null;
      const reliableFoodCost =
        dishIds.length > 0 && dishesWithCost / dishIds.length >= RECIPE_COVERAGE_THRESHOLD;
      const foodCostIsEstimated = !reliableFoodCost;
      const foodCost = reliableFoodCost
        ? recipeFoodCost
        : marginRevenue * (ESTIMATED_FOOD_COST_PCT / 100);
      const foodCostPct = marginRevenue > 0 ? (foodCost / marginRevenue) * 100 : null;

      // ---------- Supplier purchases (received purchase orders only) ----------
      let poQ = supabase
        .from("purchase_orders")
        .select("id, order_date, received_at, status")
        .eq("restaurant_id", restaurantId)
        .gte("order_date", startDate)
        .lte("order_date", endDate);
      if (locationId) poQ = poQ.eq("location_id", locationId);
      const pos = unwrapQuery(await poQ, "pos");
      const receivedPos = (pos ?? []).filter(
        (p) => p.status === "received" || p.received_at != null
      );
      let purchases = 0;
      if (receivedPos.length > 0) {
        const items = unwrapQuery(await supabase
          .from("purchase_order_items")
          .select("purchase_order_id, quantity, cost_price")
          .in(
            "purchase_order_id",
            receivedPos.map((p) => p.id)
          ), "items");
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
      const docs = unwrapQuery(await docQ, "docs");
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
      const expenses = unwrapQuery(await expQ, "expenses");
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
      const overheadsRaw = unwrapQuery(await ohQ, "overheadsRaw");

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
      // On net sales when known; on gross (incl. VAT) it is overstated and labelled.
      const operatingProfit = marginRevenue - foodCost - labourCost - dailyExpenses - overheads;
      const operatingMarginPct = marginRevenue > 0 ? (operatingProfit / marginRevenue) * 100 : null;

      // Days whose revenue has no product lines: recipe food cost cannot cover them.
      const productKeys = new Set((sales ?? []).map((r: any) => `${r.location_id ?? "null"}|${r.sale_date}`));
      const daysWithoutProductDetail = load.days.filter((d) => !productKeys.has(`${d.locationId ?? "null"}|${d.date}`)).length;

      const missing: string[] = [];
      if (!revenueKnown || revenue <= 0) missing.push("Revenue");
      if (revenueKnown && mb.basis === "gross") missing.push(revenueSummary.netCoverage === "partial" ? "Net sales (VAT) for some days" : "Net sales (VAT)");
      if (daysWithoutProductDetail > 0 && !foodCostIsEstimated) missing.push(`Product detail for ${daysWithoutProductDetail} day${daysWithoutProductDetail === 1 ? "" : "s"} (food cost incomplete)`);
      if (manualRateMissing) missing.push("Rate for manual labour hours");
      if (foodCostIsEstimated) missing.push("Food cost data");
      if (missingRateIds.size > 0) missing.push(`Pay rate for ${missingRateIds.size} staff`);
      if (uncostedIds.size > 0) missing.push(`Recipe cost for ${uncostedIds.size} dish${uncostedIds.size === 1 ? "" : "es"}`);
      if (labourCost <= 0 && !manualRateMissing) missing.push("Labour cost");
      else if (!labourConfirmed) missing.push("Labour review");
      if ((overheadsRaw?.length ?? 0) === 0) missing.push("Recurring overheads");

      return {
        revenue,
        revenueKnown,
        revenueNet: revenueSummary.net,
        vat: revenueSummary.vat,
        netCoverage: revenueSummary.netCoverage,
        marginBasis: mb.basis,
        revenueSources: revenueSummary.sources,
        labourStatus: labourSource === "none" && salariedLabourCost <= 0 ? "not_entered" : manualRateMissing || missingRateIds.size > 0 ? "partial" : "entered",
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
        missingPayRateStaff: missingRateIds.size,
        uncostedDishCount: uncostedIds.size,
        uncostedRevenue: (sales ?? []).reduce((t, r) => (r.dish_id && uncostedIds.has(r.dish_id) ? t + Number(r.total_price || 0) : t), 0),
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
