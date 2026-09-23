import {
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { DailyMetrics } from "@/hooks/useDailyBreakdown";
import type { LedgerEntry } from "@/hooks/useDailyLedger";
import { evaluateMissing } from "@/hooks/useDailyLedger";
import { effectiveOrders, effectiveVisitors } from "@/lib/effectiveOperationalMetrics";
import {
  buildFoodCostView,
  sumResolverRows,
  type FoodCostResolverRow,
  type FoodCostView,
} from "@/lib/foodCosting";

export interface ReportAttendanceDay {
  hours: number;
  cost: number;
}

export interface ReportsPeriodSummary {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  days: DailyMetrics[];
  dailyRevenue: Array<{ date: string; revenue: number }>;
  revenue: number;
  tradingDays: number;
  orders: number | null;
  visitors: number | null;
  qtySold: number;
  totalLabourCost: number;
  labourPct: number | null;
  hasAnyLabour: boolean;
  labourMissingDays: number;
  additionalExpenses: number;
  profit: number;
  costing: FoodCostView;
  needsAttentionDays: number;
  accountedDays: number;
  relevantDays: number;
  completenessPct: number | null;
  productDays: number;
  summaryDays: number;
  bothDays: number;
}

interface BuildReportsPeriodInput {
  key: string;
  label: string;
  days: DailyMetrics[];
  ledgerEntries: Map<string, LedgerEntry>;
  attendanceMap: Map<string, ReportAttendanceDay>;
  bookingDays: Set<string>;
  costMap: Map<string, FoodCostResolverRow>;
  avgHourlyRate: number;
}

export function sumCanonicalRevenue(days: DailyMetrics[], ledgerEntries: Map<string, LedgerEntry>): number {
  return days.reduce((total, day) => {
    const ledger = ledgerEntries.get(day.date);
    return total + (day.hasData ? day.revenue : (ledger?.manual_revenue ?? 0));
  }, 0);
}

export function buildReportsPeriod({
  key,
  label,
  days,
  ledgerEntries,
  attendanceMap,
  bookingDays,
  costMap,
  avgHourlyRate,
}: BuildReportsPeriodInput): ReportsPeriodSummary {
  let revenue = 0;
  let tradingDays = 0;
  let orders: number | null = null;
  let visitors: number | null = null;
  let qtySold = 0;
  let totalLabourCost = 0;
  let hasAnyLabour = false;
  let labourMissingDays = 0;
  let additionalExpenses = 0;
  let needsAttentionDays = 0;
  let accountedDays = 0;
  let relevantDays = 0;
  let productDays = 0;
  let summaryDays = 0;
  let bothDays = 0;

  const costRows: FoodCostResolverRow[] = [];
  const dailyRevenue: Array<{ date: string; revenue: number }> = [];

  for (const day of days) {
    const ledger = ledgerEntries.get(day.date);
    const attendance = attendanceMap.get(day.date);
    const effectiveRevenue = day.hasData ? day.revenue : (ledger?.manual_revenue ?? 0);
    const orderMetric = effectiveOrders(day.orders, ledger);
    const visitorMetric = effectiveVisitors(day.visitors, ledger);
    const isTrading = !ledger?.is_closed && effectiveRevenue > 0;

    revenue += effectiveRevenue;
    dailyRevenue.push({ date: day.date, revenue: effectiveRevenue });
    if (isTrading) tradingDays += 1;
    if (orderMetric.value != null) orders = (orders ?? 0) + orderMetric.value;
    if (visitorMetric.value != null) visitors = (visitors ?? 0) + visitorMetric.value;
    qtySold += day.qtySold;

    if (attendance && (attendance.hours > 0 || attendance.cost > 0)) {
      totalLabourCost += attendance.cost;
      hasAnyLabour = true;
    } else if (ledger && ledger.labour_hours > 0) {
      totalLabourCost += ledger.labour_hours * avgHourlyRate;
      hasAnyLabour = true;
    } else if (isTrading) {
      labourMissingDays += 1;
    }
    if (ledger) additionalExpenses += ledger.additional_expenses;

    const completeness = evaluateMissing(
      day.hasData,
      ledger,
      bookingDays.has(day.date),
      day.visitors,
      attendance?.hours,
    );
    if (day.hasData || ledger || bookingDays.has(day.date)) {
      relevantDays += 1;
      if (completeness.status === "accounted") accountedDays += 1;
      if (completeness.status === "needs_attention") needsAttentionDays += 1;
    }

    const products = day.hasProductDetail;
    const summary = day.hasSummary;
    if (products) productDays += 1;
    if (summary) summaryDays += 1;
    if (products && summary) bothDays += 1;

    const costRow = costMap.get(day.date);
    if (costRow) costRows.push(costRow);
  }

  const costing = buildFoodCostView(sumResolverRows(costRows), revenue);
  const profit = revenue - costing.blendedCost - totalLabourCost - additionalExpenses;

  return {
    key,
    label,
    startDate: days[0]?.date ?? key,
    endDate: days[days.length - 1]?.date ?? key,
    days,
    dailyRevenue,
    revenue,
    tradingDays,
    orders,
    visitors,
    qtySold,
    totalLabourCost,
    labourPct: revenue > 0 ? (totalLabourCost / revenue) * 100 : null,
    hasAnyLabour,
    labourMissingDays,
    additionalExpenses,
    profit,
    costing,
    needsAttentionDays,
    accountedDays,
    relevantDays,
    completenessPct: relevantDays > 0 ? (accountedDays / relevantDays) * 100 : null,
    productDays,
    summaryDays,
    bothDays,
  };
}

export function buildMonthSummaries(
  year: number,
  dailyData: DailyMetrics[],
  shared: Omit<BuildReportsPeriodInput, "key" | "label" | "days">,
): ReportsPeriodSummary[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = new Date(year, index, 1);
    const start = format(startOfMonth(month), "yyyy-MM-dd");
    const end = format(endOfMonth(month), "yyyy-MM-dd");
    return buildReportsPeriod({
      ...shared,
      key: format(month, "yyyy-MM"),
      label: format(month, "MMMM"),
      days: dailyData.filter((day) => day.date >= start && day.date <= end),
    });
  });
}

export function buildWeekSummaries(
  month: ReportsPeriodSummary,
  shared: Omit<BuildReportsPeriodInput, "key" | "label" | "days">,
): ReportsPeriodSummary[] {
  const groups = new Map<string, DailyMetrics[]>();
  for (const day of month.days) {
    const weekStart = startOfWeek(parseISO(day.date), { weekStartsOn: 1 });
    const key = format(weekStart, "yyyy-MM-dd");
    const list = groups.get(key) ?? [];
    list.push(day);
    groups.set(key, list);
  }
  return Array.from(groups.entries()).map(([key, days]) => {
    const weekStart = parseISO(key);
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    return buildReportsPeriod({
      ...shared,
      key,
      label: `${format(weekStart, "d MMM")}–${format(weekEnd, "d MMM")}`,
      days,
    });
  });
}