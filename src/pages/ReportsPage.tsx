import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  TrendingUp,
  Percent,
  ShoppingBag,
  FileText,
  Wallet,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Calendar,
  MapPin,
  Save,
  Users,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Clock,
  Check,
  X,
  CalendarDays,
  Receipt,
} from "lucide-react";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { useDailyBreakdown, type DailyMetrics } from "@/hooks/useDailyBreakdown";
import { useDailyLedger, type LedgerEntry, type MissingField, type DayStatus, evaluateMissing } from "@/hooks/useDailyLedger";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "@/contexts/LocationContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { formatCurrency, currencySymbol } from "@/lib/currency";
import { ProfitLossReport } from "@/components/reports/ProfitLossReport";
import { ReportsAccuracyNote } from "@/components/reports/ReportsAccuracyNote";
import { CashFlowReport } from "@/components/reports/CashFlowReport";
import { ReconciliationReport } from "@/components/reports/ReconciliationReport";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameDay,
  isWithinInterval,
  getDay,
} from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Missing field labels ───
const MISSING_LABELS: Record<MissingField, string> = {
  SALES: "Sales",
  LABOUR_HOURS: "Labour",
  COVERS: "Covers",
  EXPENSES: "Expenses",
  BOOKINGS: "Bookings",
};

// ─── Health helpers ───
function getHealthColor(day: DailyMetrics, labourPct: number, ledger?: LedgerEntry): string {
  if (ledger?.is_closed) return "bg-muted-foreground/30";
  if (!day.hasData && !ledger?.is_closed && ledger?.manual_revenue == null) return "bg-muted-foreground/30";
  const fc = day.foodCostPercent;
  if (day.profit > 0 && fc <= 35 && labourPct <= 35) return "bg-success";
  if (fc > 40 || labourPct > 40 || day.profit < 0) return "bg-destructive";
  return "bg-warning";
}

function getStatusLabel(status: DayStatus, ledger?: LedgerEntry): string {
  if (ledger?.is_closed) return "Closed";
  switch (status) {
    case "accounted": return "Accounted";
    case "partial": return "Partial";
    case "needs_attention": return "Needs Attention";
    case "no_data": return "No Data";
  }
}

function getStatusVariant(status: DayStatus): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "accounted": return "default";
    case "partial": return "secondary";
    case "needs_attention": return "destructive";
    case "no_data": return "outline";
  }
}

function getDotClass(status: DayStatus): string {
  switch (status) {
    case "accounted": return "bg-success";
    case "partial": return "bg-warning";
    case "needs_attention": return "bg-destructive";
    case "no_data": return "bg-muted-foreground/40";
  }
}

// ─── Data Completeness Checklist ───
function DataChecklist({ checklist }: { checklist: Record<MissingField, boolean> }) {
  const items: { field: MissingField; label: string }[] = [
    { field: "SALES", label: "Sales" },
    { field: "LABOUR_HOURS", label: "Labour" },
    { field: "COVERS", label: "Covers" },
    { field: "EXPENSES", label: "Expenses" },
    { field: "BOOKINGS", label: "Bookings" },
  ];
  return (
    <div className="rounded-md border border-border bg-secondary/20 p-2.5 space-y-1">
      <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
        Data Completeness
      </h4>
      {items.map(({ field, label }) => (
        <div key={field} className="flex items-center gap-2 text-xs">
          {checklist[field] ? (
            <Check className="h-3 w-3 text-success shrink-0" />
          ) : (
            <X className="h-3 w-3 text-destructive shrink-0" />
          )}
          <span className={checklist[field] ? "text-foreground" : "text-muted-foreground"}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Missing badge (compact) ───
function MissingBadge({ missing }: { missing: MissingField[] }) {
  if (missing.length === 0) return null;
  // Only show critical missing in badge
  const critical = missing.filter(f => f === "SALES" || f === "LABOUR_HOURS");
  if (critical.length === 0) return null;
  const shown = critical.map((f) => MISSING_LABELS[f]);
  return (
    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
      <AlertTriangle className="h-2.5 w-2.5" />
      {shown.join(", ")}
    </Badge>
  );
}

// ─── Calendar Navigation Strip ───
function CalendarStrip({
  selectedStart,
  selectedEnd,
  onDayClick,
  dailyData,
  ledgerEntries,
  focusedDate,
  bookingDays,
}: {
  selectedStart: string;
  selectedEnd: string;
  onDayClick: (dateStr: string) => void;
  dailyData: DailyMetrics[];
  ledgerEntries: Map<string, LedgerEntry>;
  focusedDate?: string;
  bookingDays: Set<string>;
}) {
  const rangeStart = parseISO(selectedStart);
  const rangeEnd = parseISO(selectedEnd);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(rangeStart));

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const coverageMap = useMemo(() => {
    const m = new Map<string, DailyMetrics>();
    dailyData.forEach((d) => m.set(d.date, d));
    return m;
  }, [dailyData]);

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const firstDayOffset = (getDay(monthStart) + 6) % 7;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setViewMonth(subMonths(viewMonth, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{format(viewMonth, "MMMM yyyy")}</span>
        <Button variant="ghost" size="sm" onClick={() => setViewMonth(addMonths(viewMonth, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((wd) => (
          <div key={wd} className="text-[10px] text-center text-muted-foreground font-medium">
            {wd}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDayOffset }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {daysInMonth.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const coverage = coverageMap.get(dateStr);
          const ledger = ledgerEntries.get(dateStr);
          const isInRange = isWithinInterval(day, { start: rangeStart, end: rangeEnd });
          const isSelected = isSameDay(day, rangeStart) || isSameDay(day, rangeEnd);
          const isFocused = focusedDate === dateStr;

          const { status } = evaluateMissing(coverage?.hasData || false, ledger, bookingDays.has(dateStr), coverage?.visitors ?? null);
          const dotClass = getDotClass(status);

          return (
            <button
              key={dateStr}
              onClick={() => onDayClick(dateStr)}
              className={cn(
                "relative flex flex-col items-center justify-center rounded-md p-1 text-xs transition-colors",
                "hover:bg-secondary",
                isFocused && "ring-2 ring-primary",
                isSelected && "bg-primary text-primary-foreground",
                isInRange && !isSelected && "bg-secondary/60",
                !isInRange && "text-muted-foreground"
              )}
            >
              <span>{format(day, "d")}</span>
              <div className="flex gap-0.5 mt-0.5 h-1.5">
                <span className={cn("w-1.5 h-1.5 rounded-full", dotClass)} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 text-[10px] text-muted-foreground pt-1">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-success" /> Accounted
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-warning" /> Partial
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-destructive" /> Needs attention
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" /> No data
        </span>
      </div>
    </div>
  );
}

// ─── Day Card ───
function DayCard({
  day,
  ledger,
  onSaveLedger,
  isSaving,
  avgHourlyRate,
  isFocused,
  cardRef,
  hasBookings,
  actualAttendance,
  plannedShiftHours,
}: {
  day: DailyMetrics;
  ledger?: LedgerEntry;
  onSaveLedger: (entry: LedgerEntry) => void;
  isSaving: boolean;
  avgHourlyRate: number;
  isFocused: boolean;
  cardRef?: React.Ref<HTMLDivElement>;
  hasBookings: boolean;
  actualAttendance?: { hours: number; cost: number };
  plannedShiftHours?: number;
}) {
  const [open, setOpen] = useState(false);
  const dateObj = parseISO(day.date);
  const label = format(dateObj, "EEE dd MMM");

  // Auto-open when focused
  useEffect(() => {
    if (isFocused) setOpen(true);
  }, [isFocused]);

  // Local form state
  const [covers, setCovers] = useState(ledger?.covers ?? 0);
  const [labourHours, setLabourHours] = useState(ledger?.labour_hours ?? 0);
  const [additionalExpenses, setAdditionalExpenses] = useState(ledger?.additional_expenses ?? 0);
  const [notes, setNotes] = useState(ledger?.notes ?? "");
  const [isClosed, setIsClosed] = useState(ledger?.is_closed ?? false);
  const [manualRevenue, setManualRevenue] = useState<number | null>(ledger?.manual_revenue ?? null);
  const [manualOrders, setManualOrders] = useState<number | null>(ledger?.manual_orders ?? null);
  const [coversUnknown, setCoversUnknown] = useState(ledger?.covers_unknown ?? false);

  useEffect(() => {
    if (ledger) {
      setCovers(ledger.covers);
      setLabourHours(ledger.labour_hours);
      setAdditionalExpenses(ledger.additional_expenses);
      setNotes(ledger.notes);
      setIsClosed(ledger.is_closed);
      setManualRevenue(ledger.manual_revenue);
      setManualOrders(ledger.manual_orders);
      setCoversUnknown(ledger.covers_unknown);
    }
  }, [ledger]);

  // Effective revenue: use manual override if no actual sales data
  const effectiveRevenue = day.hasData ? day.revenue : (manualRevenue ?? 0);
  // Orders = receipt count (from pos_daily_summaries). Qty is separate.
  const effectiveOrders: number | null = day.hasData
    ? (day.orders ?? (manualOrders ?? null))
    : (manualOrders ?? null);
  const effectiveFoodCost = day.hasData ? day.foodCost : effectiveRevenue * 0.3;
  const effectiveFoodCostPct = effectiveRevenue > 0 ? (effectiveFoodCost / effectiveRevenue) * 100 : 0;
  const foodCostIsEstimated = day.hasData ? day.foodCostIsEstimated : true;

  // Labour hierarchy: 1. actual attendance, 2. manual ledger, 3. planned shifts
  const hasActualAttendance = actualAttendance && actualAttendance.hours > 0;
  const hasManualLabour = labourHours > 0;
  const effectiveLabourHours = hasActualAttendance ? actualAttendance.hours : hasManualLabour ? labourHours : 0;
  const labourCost = hasActualAttendance ? actualAttendance.cost : effectiveLabourHours * avgHourlyRate;
  const labourSource = hasActualAttendance ? "attendance" : hasManualLabour ? "manual" : "none";
  const labourPct = effectiveRevenue > 0 ? (labourCost / effectiveRevenue) * 100 : 0;
  const adjustedProfit = effectiveRevenue - effectiveFoodCost - labourCost - additionalExpenses;
  const profitIsEstimated = foodCostIsEstimated || labourSource === "none" || day.itemsMissingCost > 0;

  // Variance between actual and planned
  const labourVariance = (plannedShiftHours != null && effectiveLabourHours > 0)
    ? effectiveLabourHours - plannedShiftHours : null;

  // Missing fields evaluation
  const actualHours = actualAttendance?.hours ?? 0;
  const { missing, status, checklist } = evaluateMissing(day.hasData, ledger, hasBookings, day.visitors, actualHours);
  // Re-evaluate with local state for live feedback
  const localLedger: LedgerEntry = {
    entry_date: day.date,
    location_id: null,
    covers,
    labour_hours: labourHours,
    additional_expenses: additionalExpenses,
    notes,
    is_closed: isClosed,
    manual_revenue: manualRevenue,
    manual_orders: manualOrders,
    covers_unknown: coversUnknown,
  };
  const liveMissing = evaluateMissing(day.hasData, localLedger, hasBookings, day.visitors, actualHours);

  const statusLabel = getStatusLabel(status, ledger);
  const healthColor = getHealthColor(day, labourPct, ledger);

  const handleSave = () => {
    onSaveLedger({
      entry_date: day.date,
      location_id: null,
      covers,
      labour_hours: labourHours,
      additional_expenses: additionalExpenses,
      notes,
      is_closed: isClosed,
      manual_revenue: manualRevenue,
      manual_orders: manualOrders,
      covers_unknown: coversUnknown,
    });
    toast.success(`Saved ledger for ${label}`);
  };

  const handleMarkClosed = () => {
    setIsClosed(true);
    setManualRevenue(0);
    setManualOrders(0);
    onSaveLedger({
      entry_date: day.date,
      location_id: null,
      covers: 0,
      labour_hours: labourHours,
      additional_expenses: additionalExpenses,
      notes: notes || "Closed / No trading",
      is_closed: true,
      manual_revenue: 0,
      manual_orders: 0,
      covers_unknown: true,
    });
    toast.success(`${label} marked as closed`);
  };

  const handleMarkCoversUnknown = () => {
    setCoversUnknown(true);
    onSaveLedger({
      ...localLedger,
      covers_unknown: true,
    });
    toast.success(`Covers marked as unknown for ${label}`);
  };

  const hasAnyData = day.hasData || isClosed || (manualRevenue != null && manualRevenue > 0);

  return (
    <div ref={cardRef}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <Card className={cn("overflow-hidden transition-colors", isFocused && "ring-2 ring-primary")}>
          <div className="flex">
            <div className={cn("w-1 shrink-0 rounded-l-lg", healthColor)} />
            <div className="flex-1">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer select-none py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      {open ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium text-sm">{label}</span>
                      <Badge variant={getStatusVariant(status)} className="text-[10px] px-1.5 py-0">
                        {statusLabel}
                      </Badge>
                      <MissingBadge missing={missing} />
                      {ledger?.manual_revenue != null && !day.hasData && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">Manual</Badge>
                      )}
                    </div>
                    {hasAnyData && !isClosed ? (
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-right">
                          <span className="text-muted-foreground mr-1">Rev</span>
                          <span className="font-medium">{formatCurrency(effectiveRevenue)}</span>
                        </div>
                        <div className="text-right hidden sm:block">
                          <span className="text-muted-foreground mr-1">Orders</span>
                          <span className="font-medium">{effectiveOrders ?? "—"}</span>
                        </div>
                        <div className="text-right hidden sm:block">
                          <span className="text-muted-foreground mr-1">Qty</span>
                          <span className="font-medium">{day.qtySold}</span>
                        </div>
                        <div className="text-right hidden sm:block">
                          <span className="text-muted-foreground mr-1">{profitIsEstimated ? "Est. Profit" : "Profit"}</span>
                          <span className={cn("font-medium", adjustedProfit >= 0 ? "text-success" : "text-destructive")}>
                            {formatCurrency(adjustedProfit)}
                          </span>
                        </div>
                        <div className="text-right hidden md:block">
                          <span className="text-muted-foreground mr-1">FC%{foodCostIsEstimated ? "*" : ""}</span>
                          <span className="font-medium">{effectiveFoodCostPct.toFixed(1)}%</span>
                        </div>
                        <div className="text-right hidden md:block">
                          <span className="text-muted-foreground mr-1">Lab%</span>
                          <span className="font-medium">{labourPct.toFixed(1)}%</span>
                        </div>
                      </div>
                    ) : isClosed ? (
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <XCircle className="h-3.5 w-3.5" /> No trading
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="pt-0 pb-4 px-4 space-y-4">
                  {/* Quick Fix Section */}
                  {liveMissing.missing.length > 0 && !isClosed && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-3">
                      <h4 className="text-xs font-medium text-destructive uppercase tracking-wide flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3" /> Quick Fix — Missing Data
                      </h4>

                      {/* SALES missing */}
                      {liveMissing.missing.includes("SALES") && (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">No sales data for this day.</p>
                          <div className="flex flex-wrap gap-2 items-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={handleMarkClosed}
                            >
                              <XCircle className="h-3 w-3" /> Mark Closed
                            </Button>
                            <div className="space-y-0.5">
                              <label className="text-[10px] text-muted-foreground">Revenue {currencySymbol}</label>
                              <Input
                                type="number"
                                min={0}
                                step={0.01}
                                value={manualRevenue ?? ""}
                                onChange={(e) => setManualRevenue(e.target.value ? Number(e.target.value) : null)}
                                className="h-7 text-xs w-24"
                                placeholder="0.00"
                              />
                            </div>
                            <div className="space-y-0.5">
                              <label className="text-[10px] text-muted-foreground">Orders</label>
                              <Input
                                type="number"
                                min={0}
                                value={manualOrders ?? ""}
                                onChange={(e) => setManualOrders(e.target.value ? Number(e.target.value) : null)}
                                className="h-7 text-xs w-20"
                                placeholder="0"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* LABOUR_HOURS missing */}
                      {liveMissing.missing.includes("LABOUR_HOURS") && (
                        <div className="flex items-end gap-2">
                          <div className="space-y-0.5">
                            <label className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" /> Labour Hours
                            </label>
                            <Input
                              type="number"
                              min={0}
                              step={0.5}
                              value={labourHours || ""}
                              onChange={(e) => setLabourHours(Number(e.target.value) || 0)}
                              className="h-7 text-xs w-24"
                            />
                          </div>
                        </div>
                      )}

                      {/* COVERS missing */}
                      {liveMissing.missing.includes("COVERS") && (
                        <div className="flex items-end gap-2">
                          <div className="space-y-0.5">
                            <label className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Users className="h-2.5 w-2.5" /> Covers
                            </label>
                            <Input
                              type="number"
                              min={0}
                              value={covers || ""}
                              onChange={(e) => setCovers(Number(e.target.value) || 0)}
                              className="h-7 text-xs w-24"
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={handleMarkCoversUnknown}
                          >
                            Mark unknown
                          </Button>
                          {day.visitors != null && day.visitors > 0 && covers !== day.visitors && (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setCovers(day.visitors!)}
                            >
                              Use Captiva ({day.visitors})
                            </Button>
                          )}
                        </div>
                      )}

                      <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSave} disabled={isSaving}>
                        <Save className="h-3 w-3" /> Save Quick Fix
                      </Button>
                    </div>
                  )}

                  {/* Data Completeness Checklist */}
                  <DataChecklist checklist={liveMissing.checklist} />

                  {/* Completed indicator */}
                  {liveMissing.status === "accounted" && (
                    <div className="flex items-center gap-1.5 text-xs text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" /> All required data present
                    </div>
                  )}

                  {/* Daily Performance — from Captiva import */}
                  {day.hasData && (
                    <div className="rounded-md border border-border bg-secondary/10 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Daily Performance
                        </h4>
                        {!day.hasSummary && (
                          <Badge variant="outline" className="text-[10px]">No POS summary</Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
                        <div className="flex justify-between"><span className="text-muted-foreground">Gross Revenue</span><span className="font-medium">{formatCurrency(day.summary?.grossSales ?? day.revenue)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Net Revenue</span><span className="font-medium">{day.summary ? formatCurrency(day.summary.netSales) : "—"}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">VAT</span><span className="font-medium">{day.summary ? formatCurrency(day.summary.vat) : "—"}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Discounts</span><span className="font-medium">{day.summary ? formatCurrency(day.summary.discounts) : "—"}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Orders</span><span className="font-medium">{day.orders ?? "—"}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">AOV</span><span className="font-medium">{day.aov != null ? formatCurrency(day.aov) : "—"}</span></div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Covers / Visitors{day.visitors != null && day.visitors > 0 ? " (Captiva)" : ""}</span>
                          <span className="font-medium">{day.visitors ?? (coversUnknown ? "Unknown" : (covers || "—"))}</span>
                        </div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Qty Sold</span><span className="font-medium">{day.qtySold}</span></div>
                      </div>
                      {/* Revenue split — reconciles back to total item revenue */}
                      {(() => {
                        const rt = day.revenueByType;
                        const catTotal = rt.food + rt.alcoholic + rt.nonAlcoholic + rt.modifier + rt.other;
                        // Unclassified = any revenue we could not bucket at all (should be 0 after backfill).
                        const unclassified = Math.max(0, day.revenue - catTotal);
                        const totalReconciled = catTotal + unclassified;
                        return (
                          <div className="pt-2 mt-1 border-t border-border/60">
                            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Revenue Split</div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
                              <div className="flex justify-between"><span className="text-muted-foreground">Food</span><span className="font-medium">{formatCurrency(rt.food)}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Alcoholic</span><span className="font-medium">{formatCurrency(rt.alcoholic)}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Non-alcoholic</span><span className="font-medium">{formatCurrency(rt.nonAlcoholic)}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Modifiers / Sides</span><span className="font-medium">{formatCurrency(rt.modifier)}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Other / Unclassified</span><span className="font-medium">{formatCurrency(rt.other + unclassified)}</span></div>
                              {day.summary && (
                                <div className="flex justify-between"><span className="text-muted-foreground">Discounts</span><span className="font-medium">−{formatCurrency(day.summary.discounts)}</span></div>
                              )}
                              <div className="flex justify-between col-span-2 md:col-span-2 border-t border-border/60 pt-1 mt-1">
                                <span className="text-muted-foreground font-medium">Total Item Revenue</span>
                                <span className="font-semibold">{formatCurrency(totalReconciled)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      {(foodCostIsEstimated || day.itemsMissingCost > 0 || labourSource === "none") && (
                        <div className="pt-1.5 border-t border-border/60 text-[11px] text-muted-foreground space-y-0.5">
                          {foodCostIsEstimated && (
                            <div>Food cost shown is <span className="text-warning font-medium">Estimated Food Cost % (30.0%)</span> — actual recipe costs not applied.</div>
                          )}
                          {day.itemsMissingCost > 0 && (
                            <div>Margin incomplete — <span className="text-warning font-medium">{day.itemsMissingCost}</span> sold items missing recipe/product cost.</div>
                          )}
                          {labourSource === "none" && (
                            <div>Labour missing — profit shown as <span className="text-warning font-medium">estimated</span>.</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}


                  {/* Inline ledger editor */}
                  <div className="rounded-md border border-border p-3 space-y-3">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Daily Inputs
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="h-3 w-3" /> Covers
                        </label>
                        <Input
                          type="number"
                          min={0}
                          value={covers || ""}
                          onChange={(e) => { setCovers(Number(e.target.value) || 0); setCoversUnknown(false); }}
                          className="h-8 text-sm"
                        />
                        {coversUnknown && (
                          <span className="text-[10px] text-muted-foreground">Marked unknown</span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Labour Hours</label>
                        <Input
                          type="number"
                          min={0}
                          step={0.5}
                          value={labourHours || ""}
                          onChange={(e) => setLabourHours(Number(e.target.value) || 0)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">
                          Add. Expenses {currencySymbol}
                        </label>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={additionalExpenses || ""}
                          onChange={(e) => setAdditionalExpenses(Number(e.target.value) || 0)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          size="sm"
                          className="h-8 gap-1.5"
                          onClick={handleSave}
                          disabled={isSaving}
                        >
                          <Save className="h-3.5 w-3.5" />
                          Save
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Notes</label>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                        className="text-sm min-h-[48px]"
                        placeholder="Daily notes…"
                      />
                    </div>

                    {/* Manual revenue/orders if overridden */}
                    {!day.hasData && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Manual Revenue {currencySymbol}</label>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={manualRevenue ?? ""}
                            onChange={(e) => setManualRevenue(e.target.value ? Number(e.target.value) : null)}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Manual Orders</label>
                          <Input
                            type="number"
                            min={0}
                            value={manualOrders ?? ""}
                            onChange={(e) => setManualOrders(e.target.value ? Number(e.target.value) : null)}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                    )}

                    {/* Closed toggle */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant={isClosed ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => setIsClosed(!isClosed)}
                      >
                        <XCircle className="h-3 w-3" />
                        {isClosed ? "Marked Closed" : "Mark Closed"}
                      </Button>
                      {isClosed && (
                        <span className="text-[10px] text-muted-foreground">No trading day — sales requirement waived</span>
                      )}
                    </div>

                    {/* Computed metrics from inputs */}
                    {hasAnyData && (
                      <div className="flex flex-wrap gap-4 text-xs pt-1">
                        <span>
                          <span className="text-muted-foreground">Labour ({labourSource === "attendance" ? "Actual" : labourSource === "manual" ? "Manual" : "—"}):</span>{" "}
                          <span className="font-medium">{effectiveLabourHours.toFixed(1)}h · {formatCurrency(labourCost)}</span>
                        </span>
                        {plannedShiftHours != null && plannedShiftHours > 0 && (
                          <span>
                            <span className="text-muted-foreground">Planned:</span>{" "}
                            <span className="font-medium">{plannedShiftHours.toFixed(1)}h</span>
                          </span>
                        )}
                        {labourVariance !== null && Math.abs(labourVariance) >= 0.5 && (
                          <span className={cn("font-medium", labourVariance > 0 ? "text-destructive" : "text-success")}>
                            {labourVariance > 0 ? "+" : ""}{labourVariance.toFixed(1)}h variance
                          </span>
                        )}
                        <span>
                          <span className="text-muted-foreground">Labour %:</span>{" "}
                          <span className="font-medium">{labourPct.toFixed(1)}%</span>
                        </span>
                        <span>
                          <span className="text-muted-foreground">Profit:</span>{" "}
                          <span className={cn("font-medium", adjustedProfit >= 0 ? "text-success" : "text-destructive")}>
                            {formatCurrency(adjustedProfit)}
                          </span>
                        </span>
                        {covers > 0 && (
                          <span>
                            <span className="text-muted-foreground">Rev/Cover:</span>{" "}
                            <span className="font-medium">{formatCurrency(effectiveRevenue / covers)}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Existing dish/location analytics */}
                  {day.hasData && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Top Dishes
                        </h4>
                        {day.topDishes.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No data</p>
                        ) : (
                          <div className="space-y-1.5">
                            {day.topDishes.map((dish, i) => (
                              <div key={i} className="flex justify-between items-center text-sm">
                                <span className="truncate mr-2">{dish.name}</span>
                                <div className="text-right shrink-0">
                                  <span className="font-medium">{dish.quantity} sold</span>
                                  <span className="text-muted-foreground ml-2">
                                    {formatCurrency(dish.revenue)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Bottom Dishes
                        </h4>
                        {day.worstDishes.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No data</p>
                        ) : (
                          <div className="space-y-1.5">
                            {day.worstDishes.map((dish, i) => (
                              <div key={i} className="flex justify-between items-center text-sm">
                                <span className="truncate mr-2">{dish.name}</span>
                                <div className="text-right shrink-0">
                                  <span className="font-medium">{dish.quantity} sold</span>
                                  <span className="text-muted-foreground ml-2">
                                    {formatCurrency(dish.revenue)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {day.hasData && day.locationPerformance.length > 1 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Location Performance
                      </h4>
                      <div className="space-y-1.5">
                        {day.locationPerformance.map((loc, i) => (
                          <div
                            key={i}
                            className="flex justify-between items-center text-sm p-2 rounded-md bg-secondary/30"
                          >
                            <span className="font-medium">{loc.name}</span>
                            <div className="flex gap-6">
                              <span>
                                <span className="text-muted-foreground mr-1">Orders:</span>
                                {loc.orders}
                              </span>
                              <span>
                                <span className="text-muted-foreground mr-1">Rev:</span>
                                <span className="text-success">{formatCurrency(loc.revenue)}</span>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!day.hasData && !isClosed && manualRevenue == null && (
                    <p className="text-sm text-muted-foreground">No sales recorded for this day.</p>
                  )}
                </CardContent>
              </CollapsibleContent>
            </div>
          </div>
        </Card>
      </Collapsible>
    </div>
  );
}

// ─── Main Page ───
export default function ReportsPage() {
  const { selectedLocationId } = useLocation();
  const { currentRestaurant } = useRestaurant();
  const { startDate, endDate, presetLabel, setCustomRange } = useDateRange();
  const { data: metrics, isLoading } = useDashboardMetrics(startDate, endDate, selectedLocationId);
  const { data: dailyData, isLoading: dailyLoading } = useDailyBreakdown(startDate, endDate, selectedLocationId);
  const { entries: ledgerEntries, upsert: upsertLedger, isSaving } = useDailyLedger(startDate, endDate, selectedLocationId);

  // Fetch actual attendance for date range
  const restaurantId = currentRestaurant?.id;
  const { data: attendanceData } = useQuery({
    queryKey: ["report-attendance", restaurantId, selectedLocationId ?? "all", startDate, endDate],
    queryFn: async () => {
      if (!restaurantId) return new Map<string, { hours: number; cost: number }>();
      let q = supabase
        .from("staff_attendance")
        .select("clock_in, clock_out, staff_id, staff(hourly_rate)")
        .eq("restaurant_id", restaurantId)
        .gte("clock_in", `${startDate}T00:00:00`)
        .lte("clock_in", `${endDate}T23:59:59`)
        .not("clock_out", "is", null);
      if (selectedLocationId) q = q.eq("location_id", selectedLocationId);
      const { data } = await q;
      const dayMap = new Map<string, { hours: number; cost: number }>();
      for (const rec of data || []) {
        if (!rec.clock_in || !rec.clock_out) continue;
        const day = rec.clock_in.split("T")[0];
        const hours = (new Date(rec.clock_out).getTime() - new Date(rec.clock_in).getTime()) / (1000 * 60 * 60);
        const rate = Number((rec.staff as any)?.hourly_rate) || 0;
        const existing = dayMap.get(day) || { hours: 0, cost: 0 };
        dayMap.set(day, { hours: existing.hours + hours, cost: existing.cost + hours * rate });
      }
      return dayMap;
    },
    enabled: !!restaurantId,
  });

  // Fetch planned shifts for date range
  const { data: shiftsData } = useQuery({
    queryKey: ["report-shifts", restaurantId, selectedLocationId ?? "all", startDate, endDate],
    queryFn: async () => {
      if (!restaurantId) return new Map<string, number>();
      let q = supabase
        .from("staff_shifts")
        .select("shift_start, shift_end")
        .eq("restaurant_id", restaurantId)
        .gte("shift_start", `${startDate}T00:00:00`)
        .lte("shift_start", `${endDate}T23:59:59`);
      if (selectedLocationId) q = q.eq("location_id", selectedLocationId);
      const { data } = await q;
      const dayMap = new Map<string, number>();
      for (const s of data || []) {
        const day = s.shift_start.split("T")[0];
        const hours = (new Date(s.shift_end).getTime() - new Date(s.shift_start).getTime()) / (1000 * 60 * 60);
        dayMap.set(day, (dayMap.get(day) || 0) + hours);
      }
      return dayMap;
    },
    enabled: !!restaurantId,
  });

  const attendanceMap = attendanceData ?? new Map<string, { hours: number; cost: number }>();
  const shiftsMap = shiftsData ?? new Map<string, number>();

  // Fetch reservation dates in range for bookings checklist
  const { data: bookingDays } = useQuery({
    queryKey: ["report-booking-days", restaurantId, selectedLocationId ?? "all", startDate, endDate],
    queryFn: async () => {
      if (!restaurantId) return new Set<string>();
      let q = supabase
        .from("reservations")
        .select("start_at")
        .eq("restaurant_id", restaurantId)
        .gte("start_at", `${startDate}T00:00:00`)
        .lte("start_at", `${endDate}T23:59:59`);
      if (selectedLocationId) q = q.eq("location_id", selectedLocationId);
      const { data } = await q;
      const days = new Set<string>();
      for (const row of data || []) {
        if (row.start_at) days.add(row.start_at.split("T")[0]);
      }
      return days;
    },
    enabled: !!restaurantId,
  });

  const bookingDaysSet = bookingDays ?? new Set<string>();

  const avgHourlyRate = 12.5;
  const [focusedDate, setFocusedDate] = useState<string | undefined>();
  const dayCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Period summary — orders/visitors from pos_daily_summaries (authoritative), qty from sales rows
  const periodSummary = useMemo(() => {
    const empty = {
      revenue: 0, orders: null as number | null, qtySold: 0, visitors: null as number | null,
      aov: null as number | null, foodCostPct: 0, profit: 0,
      totalLabourCost: 0, labourPct: 0,
      foodCostIsEstimated: true, itemsMissingCost: 0, hasAnyLabour: false,
    };
    if (!dailyData || dailyData.length === 0) return empty;

    let totalLabourCost = 0;
    let totalAdditionalExpenses = 0;
    let manualRevenueTotal = 0;
    let manualOrdersTotal = 0;
    let salesRevenue = 0;
    let qtySold = 0;
    let orderTotal: number | null = null;
    let visitorTotal: number | null = null;
    let itemsMissingCost = 0;
    let hasAnyLabour = false;

    for (const day of dailyData) {
      const ledger = ledgerEntries.get(day.date);
      const actual = attendanceMap.get(day.date);

      salesRevenue += day.revenue;
      qtySold += day.qtySold;
      itemsMissingCost += day.itemsMissingCost;
      if (day.orders != null) orderTotal = (orderTotal ?? 0) + day.orders;
      if (day.visitors != null) visitorTotal = (visitorTotal ?? 0) + day.visitors;

      if (actual && actual.hours > 0) {
        totalLabourCost += actual.cost;
        hasAnyLabour = true;
      } else if (ledger && ledger.labour_hours > 0) {
        totalLabourCost += ledger.labour_hours * avgHourlyRate;
        hasAnyLabour = true;
      }

      if (ledger) {
        totalAdditionalExpenses += ledger.additional_expenses;
        if (!day.hasData && ledger.manual_revenue != null) {
          manualRevenueTotal += ledger.manual_revenue;
          if (ledger.manual_orders != null) {
            manualOrdersTotal += ledger.manual_orders;
          }
        }
      }
    }

    const revenue = salesRevenue + manualRevenueTotal;
    if (manualOrdersTotal > 0) orderTotal = (orderTotal ?? 0) + manualOrdersTotal;
    // Consistent food cost: use the actual per-dish recipe cost % if the recipe engine
    // has coverage; otherwise fall back to a flat 30 % estimate (matches the daily row).
    const hasRealFoodCost =
      metrics?.foodCostPercent != null &&
      metrics.foodCostPercent > 0 &&
      itemsMissingCost === 0;
    const effectiveFoodCostPct = hasRealFoodCost ? (metrics!.foodCostPercent as number) : 30;
    const foodCost = revenue * (effectiveFoodCostPct / 100);
    const adjustedProfit = revenue - foodCost - totalLabourCost - totalAdditionalExpenses;
    const labourPct = revenue > 0 ? (totalLabourCost / revenue) * 100 : 0;
    const foodCostPct = effectiveFoodCostPct;
    const aov = orderTotal && orderTotal > 0 ? revenue / orderTotal : null;
    const foodCostIsEstimated = !hasRealFoodCost;

    return {
      revenue, orders: orderTotal, qtySold, visitors: visitorTotal, aov,
      foodCostPct, profit: adjustedProfit, totalLabourCost, labourPct,
      foodCostIsEstimated, itemsMissingCost, hasAnyLabour,
    };
  }, [metrics, dailyData, ledgerEntries, avgHourlyRate, attendanceMap]);
  const profitIsEstimated = periodSummary.foodCostIsEstimated || !periodSummary.hasAnyLabour;

  // Count days needing attention for summary
  const missingDaysCount = useMemo(() => {
    if (!dailyData) return 0;
    return dailyData.filter((day) => {
      const ledger = ledgerEntries.get(day.date);
      const actual = attendanceMap.get(day.date);
      const { status } = evaluateMissing(day.hasData, ledger, bookingDaysSet.has(day.date), day.visitors, actual?.hours);
      return status === "needs_attention";
    }).length;
  }, [dailyData, ledgerEntries, bookingDaysSet, attendanceMap]);

  const handleDayClick = useCallback(
    (dateStr: string) => {
      setFocusedDate(dateStr);
      // Scroll to the card
      setTimeout(() => {
        const el = dayCardRefs.current.get(dateStr);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 50);
    },
    []
  );

  const setDayCardRef = useCallback((dateStr: string, el: HTMLDivElement | null) => {
    if (el) {
      dayCardRefs.current.set(dateStr, el);
    } else {
      dayCardRefs.current.delete(dateStr);
    }
  }, []);

  return (
    <PageLayout title="Reports" subtitle="Business performance metrics and daily breakdown">
      <Tabs defaultValue="daily" className="space-y-6">
        <TabsList>
          <TabsTrigger value="daily" className="gap-2">
            <ShoppingBag className="h-4 w-4" />
            Period Summary
          </TabsTrigger>
          <TabsTrigger value="pnl" className="gap-2">
            <FileText className="h-4 w-4" />
            Profit & Loss
          </TabsTrigger>
          <TabsTrigger value="cashflow" className="gap-2">
            <Wallet className="h-4 w-4" />
            Cash Flow
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Reconciliation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="space-y-4">
          {/* Date Context Header */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{presetLabel}</span>
              {startDate !== endDate && (
                <span>
                  ({startDate} → {endDate})
                </span>
              )}
            </div>
            {selectedLocationId && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                <span>Filtered by location</span>
              </div>
            )}
            {missingDaysCount > 0 && (
              <Badge variant="destructive" className="text-[10px] gap-1">
                <AlertTriangle className="h-2.5 w-2.5" />
                {missingDaysCount} day{missingDaysCount > 1 ? "s" : ""} need attention
              </Badge>
            )}
          </div>

          {/* Accuracy Note */}
          <ReportsAccuracyNote locationId={selectedLocationId} />

          {isLoading ? (
            <div className="text-muted-foreground text-sm">Loading metrics…</div>
          ) : (
            <>
              {/* Period Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Revenue</CardTitle>
                    <span className="text-xs text-primary font-medium">{currencySymbol}</span>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="text-xl font-bold">{formatCurrency(periodSummary.revenue)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Orders</CardTitle>
                    <Receipt className="h-3.5 w-3.5 text-primary" />
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="text-xl font-bold">{periodSummary.orders ?? "—"}</div>
                    <div className="text-[10px] text-muted-foreground">receipts</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">AOV</CardTitle>
                    <span className="text-xs text-primary font-medium">{currencySymbol}</span>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="text-xl font-bold">{periodSummary.aov != null ? formatCurrency(periodSummary.aov) : "—"}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Covers / Visitors</CardTitle>
                    <Users className="h-3.5 w-3.5 text-primary" />
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="text-xl font-bold">{periodSummary.visitors ?? "—"}</div>
                    {periodSummary.visitors != null && periodSummary.visitors > 0 && (
                      <div className="text-[10px] text-muted-foreground">from Captiva</div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Qty Sold</CardTitle>
                    <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="text-xl font-bold">{periodSummary.qtySold}</div>
                    <div className="text-[10px] text-muted-foreground">item units</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">
                      {periodSummary.foodCostIsEstimated ? "Est. Food Cost %" : "Food Cost %"}
                    </CardTitle>
                    <Percent className="h-3.5 w-3.5 text-primary" />
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="text-xl font-bold">{periodSummary.foodCostPct.toFixed(1)}%</div>
                    {periodSummary.foodCostIsEstimated && (
                      <div className="text-[10px] text-muted-foreground">default 30%</div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Labour %</CardTitle>
                    <Users className="h-3.5 w-3.5 text-primary" />
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="text-xl font-bold">{periodSummary.labourPct.toFixed(1)}%</div>
                    <div className="text-[10px] text-muted-foreground">{formatCurrency(periodSummary.totalLabourCost)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">
                      {profitIsEstimated ? "Est. Profit" : "Profit"}
                    </CardTitle>
                    <TrendingUp className="h-3.5 w-3.5 text-success" />
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className={cn("text-xl font-bold", periodSummary.profit >= 0 ? "text-success" : "text-destructive")}>
                      {formatCurrency(periodSummary.profit)}
                    </div>
                    {periodSummary.itemsMissingCost > 0 && (
                      <div className="text-[10px] text-warning">Margin incomplete — {periodSummary.itemsMissingCost} items missing cost</div>
                    )}
                  </CardContent>
                </Card>
              </div>


              {/* Calendar Navigation Strip */}
              <Card>
                <CardContent className="p-3">
                  <CalendarStrip
                    selectedStart={startDate}
                    selectedEnd={endDate}
                    onDayClick={handleDayClick}
                    dailyData={dailyData || []}
                    ledgerEntries={ledgerEntries}
                    focusedDate={focusedDate}
                    bookingDays={bookingDaysSet}
                  />
                </CardContent>
              </Card>

              {/* Daily Breakdown */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Daily Performance
                </h3>
                {dailyLoading ? (
                  <div className="text-muted-foreground text-sm">Loading daily data…</div>
                ) : !dailyData || dailyData.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No days in selected range.</p>
                ) : (
                  <div className="space-y-2">
                    {dailyData.map((day) => (
                      <DayCard
                        key={day.date}
                        day={day}
                        ledger={ledgerEntries.get(day.date)}
                        onSaveLedger={upsertLedger}
                        isSaving={isSaving}
                        avgHourlyRate={avgHourlyRate}
                        isFocused={focusedDate === day.date}
                        cardRef={(el) => setDayCardRef(day.date, el)}
                        hasBookings={bookingDaysSet.has(day.date)}
                        actualAttendance={attendanceMap.get(day.date)}
                        plannedShiftHours={shiftsMap.get(day.date)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="pnl">
          <ProfitLossReport />
        </TabsContent>

        <TabsContent value="cashflow">
          <CashFlowReport />
        </TabsContent>

        <TabsContent value="reconciliation">
          <ReconciliationReport />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
