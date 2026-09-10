import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SALARY_DAYS_PER_YEAR = 365;
/** Max dishes we cost via the canonical RPC per request (keeps the context compact). */
const MAX_COSTED_DISHES = 60;

function eur(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "n/a";
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(Number(n));
}
function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "n/a";
  return `${Number(n).toFixed(1)}%`;
}
function calendarDays(startDate: string, endDate: string): number {
  const s = new Date(`${startDate}T00:00:00`).getTime();
  const e = new Date(`${endDate}T00:00:00`).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 1;
  return Math.round((e - s) / 86_400_000) + 1;
}
/** Same frequency treatment as Reports (monthly basis), expressed per day. */
function overheadDailyAmount(amount: number, frequency: string): number {
  switch (frequency) {
    case "daily":
      return amount;
    case "weekly":
      return amount / 7;
    case "yearly":
      return amount / 365;
    case "monthly":
    default:
      return amount / 30;
  }
}
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // User-scoped client only: every read below is filtered by the caller's RLS,
    // role permissions and location access. No service-role client is used here.
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

    const body = await req.json();
    const restaurant_id: string | undefined = body?.restaurant_id;
    const message: string | undefined = body?.message;
    const history = Array.isArray(body?.history) ? body.history.slice(-10) : [];
    let location_id: string | null = body?.location_id ?? null;
    const start_date: string = isDate(body?.start_date) ? body.start_date : "";
    const end_date: string = isDate(body?.end_date) ? body.end_date : "";

    if (!restaurant_id || !message || !start_date || !end_date) {
      return new Response(
        JSON.stringify({ error: "restaurant_id, message, start_date and end_date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Tenant + location authorisation (canonical helpers) ---
    const { data: belongs } = await supabaseClient.rpc("user_belongs_to_restaurant", {
      _restaurant_id: restaurant_id,
    });
    if (!belongs) {
      return new Response(JSON.stringify({ error: "Forbidden: not a member of this restaurant" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isOwner } = await supabaseClient.rpc("user_is_owner");
    const { data: allowedLocationRows } = await supabaseClient.rpc("get_user_location_ids");
    const allowedLocationIds: string[] = (allowedLocationRows ?? [])
      .map((r: any) => (typeof r === "string" ? r : r?.get_user_location_ids))
      .filter(Boolean);

    if (location_id) {
      const { data: canAccess } = await supabaseClient.rpc("user_can_access_location", {
        _location_id: location_id,
      });
      if (!canAccess) {
        return new Response(JSON.stringify({ error: "Forbidden: no access to this location" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Non-owners are always constrained to their assigned locations, even when the
    // client sends no location: a single assignment is pinned automatically.
    let scopeLocationIds: string[] | null = null; // null = all locations the caller may see
    if (!location_id && !isOwner) {
      if (allowedLocationIds.length === 0) {
        return new Response(
          JSON.stringify({ error: "No location assigned to your account" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (allowedLocationIds.length === 1) location_id = allowedLocationIds[0];
      else scopeLocationIds = allowedLocationIds;
    }

    const applyLoc = <T extends { eq: any; in: any }>(q: T, col = "location_id"): T => {
      if (location_id) return q.eq(col, location_id);
      if (scopeLocationIds) return q.in(col, scopeLocationIds);
      return q;
    };

    const days = calendarDays(start_date, end_date);
    const startISO = `${start_date}T00:00:00.000Z`;
    const endISO = `${end_date}T23:59:59.999Z`;

    // --- Locations (names for context) ---
    const { data: locations } = await supabaseClient
      .from("locations")
      .select("id, name")
      .eq("restaurant_id", restaurant_id);
    const locationName = (id: string | null) =>
      (locations ?? []).find((l: any) => l.id === id)?.name ?? "Unknown";

    // --- Canonical revenue source: pos_daily_summaries ---
    const { data: posSummaries } = await applyLoc(
      supabaseClient
        .from("pos_daily_summaries")
        .select("report_date, location_id, gross_sales, net_sales, vat_amount, discounts, order_count, visitor_count")
        .eq("restaurant_id", restaurant_id)
        .gte("report_date", start_date)
        .lte("report_date", end_date)
    );

    const posRows = posSummaries ?? [];
    const posNet = posRows.reduce((s: number, r: any) => s + Number(r.net_sales || 0), 0);
    const posGross = posRows.reduce((s: number, r: any) => s + Number(r.gross_sales || 0), 0);
    const posOrders = posRows.reduce((s: number, r: any) => s + Number(r.order_count || 0), 0);
    const posVisitors = posRows.reduce((s: number, r: any) => s + Number(r.visitor_count || 0), 0);
    const posDates = new Set(posRows.map((r: any) => r.report_date));

    // --- Item-level sales for the period (for dish mix + COGS) ---
    const { data: salesRows } = await applyLoc(
      supabaseClient
        .from("sales")
        .select("dish_id, quantity, total_price, sale_date, location_id")
        .eq("restaurant_id", restaurant_id)
        .gte("sale_date", start_date)
        .lte("sale_date", end_date)
        .limit(20000)
    );
    const sales = salesRows ?? [];
    const salesRevenue = sales.reduce((s: number, r: any) => s + Number(r.total_price || 0), 0);

    const perDish = new Map<string, { qty: number; revenue: number }>();
    for (const r of sales) {
      if (!r.dish_id) continue;
      const cur = perDish.get(r.dish_id) ?? { qty: 0, revenue: 0 };
      cur.qty += Number(r.quantity || 0);
      cur.revenue += Number(r.total_price || 0);
      perDish.set(r.dish_id, cur);
    }

    // Revenue used for restaurant-level margins: POS summaries when present, else item sales.
    const revenue = posRows.length > 0 ? posNet || posGross : salesRevenue;
    const revenueSource =
      posRows.length > 0 ? "pos_daily_summaries (canonical POS revenue)" : "sales table (no POS summaries for this period)";

    // --- Dishes + canonical cost/margin via RPCs ---
    let dishQ = supabaseClient
      .from("dishes")
      .select("id, name, category, selling_price, is_active, location_id, merged_into_id, use_direct_cost, direct_cost")
      .eq("restaurant_id", restaurant_id)
      .is("merged_into_id", null);
    dishQ = applyLoc(dishQ as any);
    const { data: dishRows } = await dishQ;
    const dishes = (dishRows ?? []).filter((d: any) => d.is_active !== false);

    const rankedDishIds = [...perDish.entries()]
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([id]) => id);
    const costTargets = rankedDishIds.slice(0, MAX_COSTED_DISHES);
    // Ensure we also cost some unsold dishes so coverage is meaningful.
    for (const d of dishes) {
      if (costTargets.length >= MAX_COSTED_DISHES) break;
      if (!costTargets.includes(d.id)) costTargets.push(d.id);
    }

    const costed = await Promise.all(
      costTargets.map(async (id) => {
        const [{ data: cost }, { data: margin }] = await Promise.all([
          supabaseClient.rpc("calculate_dish_cost", { p_dish_id: id }),
          supabaseClient.rpc("calculate_dish_margin", { p_dish_id: id }),
        ]);
        const dish = dishes.find((d: any) => d.id === id);
        const sold = perDish.get(id);
        const price = Number(dish?.selling_price ?? 0);
        const c = cost === null || cost === undefined ? null : Number(cost);
        return {
          id,
          name: dish?.name ?? "Unknown dish",
          category: dish?.category ?? null,
          price,
          cost: c && c > 0 ? c : null,
          marginPct: margin === null || margin === undefined ? null : Number(margin),
          grossProfit: c && c > 0 ? price - c : null,
          foodCostPct: c && c > 0 && price > 0 ? (c / price) * 100 : null,
          qty: sold?.qty ?? 0,
          revenue: sold?.revenue ?? 0,
        };
      })
    );

    const costedMap = new Map(costed.map((d) => [d.id, d]));
    const withCost = costed.filter((d) => d.cost !== null);
    const withoutCost = costed.filter((d) => d.cost === null);

    // Period COGS from canonical dish costs (only dishes that actually have a cost).
    let cogs = 0;
    let cogsCoveredRevenue = 0;
    let uncostedSoldRevenue = 0;
    for (const [dishId, s] of perDish.entries()) {
      const d = costedMap.get(dishId);
      if (d?.cost) {
        cogs += d.cost * s.qty;
        cogsCoveredRevenue += s.revenue;
      } else {
        uncostedSoldRevenue += s.revenue;
      }
    }
    const cogsCoveragePct = salesRevenue > 0 ? (cogsCoveredRevenue / salesRevenue) * 100 : null;

    // --- Recipe coverage (dish_ingredients + ingredient prices) ---
    const { data: recipeRows } = await supabaseClient
      .from("dish_ingredients")
      .select("dish_id, ingredient_id")
      .eq("restaurant_id", restaurant_id);
    const dishIdSet = new Set(dishes.map((d: any) => d.id));
    const dishesWithRecipe = new Set(
      (recipeRows ?? []).filter((r: any) => dishIdSet.has(r.dish_id)).map((r: any) => r.dish_id)
    );
    const dishesUsingDirectCost = dishes.filter((d: any) => d.use_direct_cost && Number(d.direct_cost) > 0).length;

    const { data: ingredientRows } = await supabaseClient
      .from("ingredients")
      .select("id, name, unit, default_cost_price, cost_per_pack, pack_size, supplier_id")
      .eq("restaurant_id", restaurant_id);
    const ingredients = ingredientRows ?? [];
    const unpricedIngredients = ingredients.filter(
      (i: any) => !Number(i.default_cost_price) && !Number(i.cost_per_pack)
    );

    // --- Labour (pay-type aware, same method as the platform) ---
    let attQ = supabaseClient
      .from("staff_attendance")
      .select("clock_in, clock_out, location_id, staff(hourly_rate, pay_type, annual_salary, department)")
      .eq("restaurant_id", restaurant_id)
      .gte("clock_in", startISO)
      .lte("clock_in", endISO);
    attQ = applyLoc(attQ as any);
    const { data: attendance } = await attQ;

    let hourlyCost = 0;
    let hourlyHours = 0;
    let salariedHours = 0;
    for (const a of attendance ?? []) {
      const staff: any = (a as any).staff;
      if (!a.clock_in || !a.clock_out) continue;
      const hrs = (new Date(a.clock_out).getTime() - new Date(a.clock_in).getTime()) / 3_600_000;
      if (!Number.isFinite(hrs) || hrs <= 0) continue;
      if (staff?.pay_type === "salary") {
        salariedHours += hrs;
      } else {
        hourlyHours += hrs;
        hourlyCost += hrs * Number(staff?.hourly_rate || 0);
      }
    }

    let staffQ = supabaseClient
      .from("staff")
      .select("id, annual_salary, pay_type, status, location_id")
      .eq("restaurant_id", restaurant_id)
      .eq("pay_type", "salary")
      .eq("status", "active");
    staffQ = applyLoc(staffQ as any);
    const { data: salariedStaff } = await staffQ;
    const salaryCost = (salariedStaff ?? []).reduce((sum: number, s: any) => {
      const annual = Number(s.annual_salary);
      if (!Number.isFinite(annual) || annual <= 0) return sum;
      return sum + (annual / SALARY_DAYS_PER_YEAR) * days;
    }, 0);
    const labourCost = hourlyCost + salaryCost;

    // --- Overheads (active, location-aware, prorated to the period) ---
    const { data: overheadRows } = await supabaseClient
      .from("overheads")
      .select("name, category, amount, frequency, is_active, start_date, end_date, location_id")
      .eq("restaurant_id", restaurant_id)
      .eq("is_active", true);
    const overheadsApplicable = (overheadRows ?? []).filter((o: any) => {
      if (location_id && o.location_id && o.location_id !== location_id) return false;
      if (scopeLocationIds && o.location_id && !scopeLocationIds.includes(o.location_id)) return false;
      if (o.start_date && o.start_date > end_date) return false;
      if (o.end_date && o.end_date < start_date) return false;
      return true;
    });
    const overheadsTotal = overheadsApplicable.reduce(
      (s: number, o: any) => s + overheadDailyAmount(Number(o.amount || 0), o.frequency) * days,
      0
    );

    // --- Daily expenses ---
    let expQ = supabaseClient
      .from("daily_expenses")
      .select("amount, category, entry_date, location_id")
      .eq("restaurant_id", restaurant_id)
      .gte("entry_date", start_date)
      .lte("entry_date", end_date);
    expQ = applyLoc(expQ as any);
    const { data: expenseRows } = await expQ;
    const expenses = expenseRows ?? [];
    const expensesTotal = expenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const expenseByCategory = new Map<string, number>();
    for (const e of expenses) {
      expenseByCategory.set(e.category, (expenseByCategory.get(e.category) ?? 0) + Number(e.amount || 0));
    }

    // --- Wastage / stock adjustments ---
    let adjQ = supabaseClient
      .from("stock_adjustments")
      .select("adjustment_type, quantity, reason, ingredient_id, created_at, location_id")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", startISO)
      .lte("created_at", endISO);
    adjQ = applyLoc(adjQ as any);
    const { data: adjustmentRows } = await adjQ;
    const adjustments = adjustmentRows ?? [];
    const wastageByType = new Map<string, number>();
    for (const a of adjustments) {
      wastageByType.set(a.adjustment_type, (wastageByType.get(a.adjustment_type) ?? 0) + 1);
    }

    // --- Daily ledger (closed / confirmed status) ---
    let ledgerQ = supabaseClient
      .from("daily_ledger_entries")
      .select("entry_date, location_id, is_closed, labour_confirmed, expenses_confirmed, stock_reviewed, covers, covers_unknown")
      .eq("restaurant_id", restaurant_id)
      .gte("entry_date", start_date)
      .lte("entry_date", end_date);
    ledgerQ = applyLoc(ledgerQ as any);
    const { data: ledgerRows } = await ledgerQ;
    const ledger = ledgerRows ?? [];
    const closedDays = ledger.filter((l: any) => l.is_closed).length;
    const labourConfirmedDays = ledger.filter((l: any) => l.labour_confirmed).length;
    const expensesConfirmedDays = ledger.filter((l: any) => l.expenses_confirmed).length;
    const ledgerCovers = ledger.reduce((s: number, l: any) => s + Number(l.covers || 0), 0);

    // --- Suppliers (for cost explanations only) ---
    const { data: supplierRows } = await supabaseClient
      .from("suppliers")
      .select("id, name")
      .eq("restaurant_id", restaurant_id);
    const supplierName = (id: string | null) =>
      (supplierRows ?? []).find((s: any) => s.id === id)?.name ?? "No supplier";

    // --- Derived restaurant-level figures (canonical Reports definitions) ---
    const grossProfit = revenue > 0 || cogs > 0 ? revenue - cogs : null;
    const grossMargin = revenue > 0 && grossProfit !== null ? (grossProfit / revenue) * 100 : null;
    const operatingProfit =
      grossProfit !== null ? grossProfit - labourCost - overheadsTotal - expensesTotal : null;
    const operatingMargin =
      revenue > 0 && operatingProfit !== null ? (operatingProfit / revenue) * 100 : null;

    const covers = ledgerCovers > 0 ? ledgerCovers : posVisitors;
    const aov = posOrders > 0 ? revenue / posOrders : null;

    // ---------------- Build the compact context ----------------
    const scopeLabel = location_id
      ? locationName(location_id)
      : scopeLocationIds
        ? `Assigned locations: ${scopeLocationIds.map(locationName).join(", ")}`
        : "All locations the user may access";

    const topDishes = [...costed]
      .filter((d) => d.qty > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);
    const worstMargin = withCost
      .filter((d) => d.qty > 0 && d.marginPct !== null)
      .sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0))
      .slice(0, 8);

    const dishLine = (d: typeof costed[number]) =>
      `- ${d.name}${d.category ? ` [${d.category}]` : ""}: price ${eur(d.price)}, recipe cost ${d.cost === null ? "MISSING" : eur(d.cost)}, gross profit ${d.grossProfit === null ? "n/a" : eur(d.grossProfit)}, gross margin ${pct(d.marginPct)}, food cost ${pct(d.foodCostPct)}, sold ${d.qty} (${eur(d.revenue)})`;

    const context = `PERIOD: ${start_date} to ${end_date} (${days} calendar day${days === 1 ? "" : "s"})
SCOPE: ${scopeLabel}${isOwner ? " (Owner)" : " (non-Owner: restricted to assigned locations)"}

RESTAURANT-LEVEL FIGURES (canonical)
- Revenue: ${eur(revenue)} — source: ${revenueSource}
- POS gross sales: ${eur(posGross)}; POS net sales: ${eur(posNet)}; item-level sales total: ${eur(salesRevenue)}
- Orders: ${posOrders || "n/a"}; Covers: ${covers || "n/a"}; Average order value: ${aov === null ? "n/a" : eur(aov)}
- COGS / food cost (sum of canonical dish recipe cost x quantity sold): ${eur(cogs)} covering ${pct(cogsCoveragePct)} of item revenue
- Uncosted sold revenue (no recipe cost available): ${eur(uncostedSoldRevenue)}
- Gross profit: ${grossProfit === null ? "n/a" : eur(grossProfit)}; Gross margin: ${pct(grossMargin)}
- Labour cost: ${eur(labourCost)} (hourly ${eur(hourlyCost)} over ${hourlyHours.toFixed(1)} h; salaried allocation ${eur(salaryCost)} for ${(salariedStaff ?? []).length} active salaried staff, annual salary ÷ ${SALARY_DAYS_PER_YEAR} × ${days} days). Salaried attendance hours logged but never priced: ${salariedHours.toFixed(1)} h
- Overheads allocated to period: ${eur(overheadsTotal)} across ${overheadsApplicable.length} active overhead(s)
- Operating expenses recorded (daily expenses): ${eur(expensesTotal)} across ${expenses.length} entr${expenses.length === 1 ? "y" : "ies"}
- Operating profit: ${operatingProfit === null ? "n/a" : eur(operatingProfit)}; Operating margin: ${pct(operatingMargin)}

TOP DISHES BY REVENUE (canonical calculate_dish_cost / calculate_dish_margin)
${topDishes.length ? topDishes.map(dishLine).join("\n") : "- No dish sales in this period."}

LOWEST GROSS MARGIN DISHES SOLD
${worstMargin.length ? worstMargin.map(dishLine).join("\n") : "- Not enough costed dishes to rank."}

OVERHEADS (active, applicable to this period)
${overheadsApplicable.length
  ? overheadsApplicable
      .slice(0, 20)
      .map((o: any) => `- ${o.name} [${o.category}]: ${eur(Number(o.amount))} ${o.frequency} → ${eur(overheadDailyAmount(Number(o.amount || 0), o.frequency) * days)} for this period`)
      .join("\n")
  : "- No active overheads configured."}

OPERATING EXPENSES BY CATEGORY
${expenseByCategory.size
  ? [...expenseByCategory.entries()].map(([c, v]) => `- ${c}: ${eur(v)}`).join("\n")
  : "- No expenses recorded in this period."}

WASTAGE / STOCK ADJUSTMENTS
${adjustments.length
  ? [...wastageByType.entries()].map(([t, n]) => `- ${t}: ${n} adjustment(s)`).join("\n")
  : "- No stock adjustments recorded in this period."}

SUPPLIER / INGREDIENT PRICING (most expensive priced ingredients, for cost explanations)
${ingredients.length
  ? [...ingredients]
      .filter((i: any) => Number(i.default_cost_price) > 0 || Number(i.cost_per_pack) > 0)
      .sort((a: any, b: any) => Number(b.cost_per_pack || b.default_cost_price || 0) - Number(a.cost_per_pack || a.default_cost_price || 0))
      .slice(0, 15)
      .map((i: any) => `- ${i.name} (${i.unit}): ${i.cost_per_pack ? `${eur(Number(i.cost_per_pack))} per pack of ${i.pack_size ?? "?"}` : `${eur(Number(i.default_cost_price))} per ${i.unit}`} — ${supplierName(i.supplier_id)}`)
      .join("\n") || "- No priced ingredients."
  : "- No ingredients recorded."}

DATA COVERAGE AND CONFIDENCE
- Active dishes in scope: ${dishes.length}
- Dishes with a recipe (dish_ingredients): ${dishesWithRecipe.size} (${dishes.length ? pct((dishesWithRecipe.size / dishes.length) * 100) : "n/a"})
- Dishes priced with a direct cost instead of a recipe: ${dishesUsingDirectCost}
- Dishes costed in this context: ${costed.length}; with a usable cost: ${withCost.length}; MISSING cost: ${withoutCost.length}${withoutCost.length ? ` (${withoutCost.slice(0, 10).map((d) => d.name).join(", ")}${withoutCost.length > 10 ? ", …" : ""})` : ""}
- Ingredients with no price at all: ${unpricedIngredients.length} of ${ingredients.length}${unpricedIngredients.length ? ` (e.g. ${unpricedIngredients.slice(0, 8).map((i: any) => i.name).join(", ")})` : ""}
- POS coverage: ${posDates.size} of ${days} day(s) in the period have POS daily summaries${posDates.size < days ? " — POS data is INCOMPLETE for this period" : ""}
- Labour data: ${(attendance ?? []).length} attendance record(s); labour confirmed on ${labourConfirmedDays} of ${ledger.length} ledger day(s)
- Overheads configured: ${overheadsApplicable.length > 0 ? "yes" : "NO — operating profit will be understated"}
- Expenses recorded: ${expenses.length > 0 ? `yes (confirmed on ${expensesConfirmedDays} ledger day(s))` : "NO"}
- Day status: ${closedDays} of ${ledger.length} ledger day(s) closed; remaining days are PROVISIONAL
- Ledger days present: ${ledger.length} of ${days}`;

    // --- Call Lovable AI ---
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are the RestaurantAI assistant. You answer questions about ONE restaurant using the trusted figures supplied below. You are speaking to an owner or a manager.

CANONICAL DEFINITIONS (these are the application's own definitions — never invent alternatives):
- Dish gross profit = selling price − dish recipe cost (recipe cost comes from calculate_dish_cost)
- Dish gross margin % = dish gross profit ÷ selling price × 100 (calculate_dish_margin)
- Dish food cost % = dish recipe cost ÷ selling price × 100
- Restaurant gross profit = revenue − COGS (food cost)
- Restaurant gross margin % = gross profit ÷ revenue × 100
- Operating profit = revenue − COGS − labour − overheads − operating expenses
- Operating margin % = operating profit ÷ revenue × 100
- Labour: hourly staff = worked hours × hourly rate; salaried staff = annual salary ÷ 365 × days in period. Salaried attendance hours are never priced (no double counting).
- Revenue comes from POS daily summaries when available; item-level sales are the fallback.

RULES:
1. Use the supplied canonical figures. Do NOT recalculate a metric that is already given, and do not invent your own formula. Only do simple arithmetic (differences, shares, per-day averages) where the figure is not provided.
2. NEVER fabricate or assume missing values. No assumed food cost percentages, no assumed hourly rates, no assumed rent. If an input is missing, say exactly what is missing, and state whether your answer is COMPLETE, INDICATIVE (partial data) or UNAVAILABLE.
3. Use the DATA COVERAGE AND CONFIDENCE section to qualify every profitability answer. If recipe costing covers only part of revenue, say so and give the coverage percentage.
4. "Margin" is ambiguous. If the question is about a dish or menu item, use dish gross margin. If it is about the business, use restaurant gross margin or operating margin as appropriate. If it is unclear which is meant, briefly distinguish them and give both rather than guessing.
5. Respect the scope shown: your figures cover only the stated period and locations. Never imply you can see other locations or dates.
6. Amounts are in euro. Be concise, use bullet points, and lead with the number the user asked for.

TRUSTED DATA CONTEXT:
${context}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...history.map((msg: any) => ({ role: msg.role, content: msg.content })),
          { role: "user", content: message },
        ],
        temperature: 0.3,
        max_tokens: 1200,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);
      const status = aiResponse.status === 429 || aiResponse.status === 402 ? aiResponse.status : 502;
      return new Response(
        JSON.stringify({
          error:
            aiResponse.status === 429
              ? "The AI service is rate limited right now. Please try again shortly."
              : aiResponse.status === 402
                ? "AI credits are exhausted for this workspace. Please top up to continue."
                : "The AI service returned an error.",
        }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const assistantResponse =
      aiData.choices?.[0]?.message?.content || "I couldn't generate a response. Please try again.";

    return new Response(
      JSON.stringify({
        response: assistantResponse,
        scope: {
          start_date,
          end_date,
          location_id,
          location_name: location_id ? locationName(location_id) : null,
          is_owner: !!isOwner,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AI Assistant error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
