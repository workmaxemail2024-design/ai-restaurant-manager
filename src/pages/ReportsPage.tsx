import { useState, useMemo, useCallback, useEffect } from "react";
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
} from "lucide-react";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { useDailyBreakdown, type DailyMetrics } from "@/hooks/useDailyBreakdown";
import { useDailyLedger, type LedgerEntry } from "@/hooks/useDailyLedger";
import { useLocation } from "@/contexts/LocationContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { formatCurrency, currencySymbol } from "@/lib/currency";
import { ProfitLossReport } from "@/components/reports/ProfitLossReport";
import { CashFlowReport } from "@/components/reports/CashFlowReport";
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

// ─── Health helpers ───
function getHealthColor(day: DailyMetrics, labourPct: number): string {
  if (!day.hasData) return "bg-muted-foreground/30";
  const fc = day.foodCostPercent;
  if (day.profit > 0 && fc <= 35 && labourPct <= 35) return "bg-success";
  if (fc > 40 || labourPct > 40 || day.profit < 0) return "bg-destructive";
  return "bg-warning";
}

function getStatusLabel(day: DailyMetrics, ledger?: LedgerEntry): string {
  if (!day.hasData && !ledger) return "No Data";
  if (!day.hasData && ledger) return "Missing Data";
  const hasMissing = !ledger || (ledger.covers === 0 && ledger.labour_hours === 0);
  if (hasMissing) return "Missing Data";
  return "Complete";
}

function getStatusVariant(label: string): "default" | "secondary" | "outline" | "destructive" {
  if (label === "Complete") return "default";
  if (label === "Missing Data") return "secondary";
  return "outline";
}

// ─── Calendar Navigation Strip ───
function CalendarStrip({
  selectedStart,
  selectedEnd,
  onDayClick,
  dailyData,
}: {
  selectedStart: string;
  selectedEnd: string;
  onDayClick: (dateStr: string) => void;
  dailyData: DailyMetrics[];
}) {
  const rangeStart = parseISO(selectedStart);
  const rangeEnd = parseISO(selectedEnd);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(rangeStart));

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Build coverage map from dailyData
  const coverageMap = useMemo(() => {
    const m = new Map<string, DailyMetrics>();
    dailyData.forEach((d) => m.set(d.date, d));
    return m;
  }, [dailyData]);

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Offset for first day alignment (Monday = 0)
  const firstDayOffset = (getDay(monthStart) + 6) % 7;

  return (
    <div className="space-y-2">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setViewMonth(subMonths(viewMonth, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{format(viewMonth, "MMMM yyyy")}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setViewMonth(addMonths(viewMonth, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((wd) => (
          <div key={wd} className="text-[10px] text-center text-muted-foreground font-medium">
            {wd}
          </div>
        ))}
      </div>

      {/* Day chips */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty spacers for offset */}
        {Array.from({ length: firstDayOffset }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {daysInMonth.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const coverage = coverageMap.get(dateStr);
          const isInRange = isWithinInterval(day, { start: rangeStart, end: rangeEnd });
          const isSelected =
            isSameDay(day, rangeStart) || isSameDay(day, rangeEnd);

          return (
            <button
              key={dateStr}
              onClick={() => onDayClick(dateStr)}
              className={cn(
                "relative flex flex-col items-center justify-center rounded-md p-1 text-xs transition-colors",
                "hover:bg-secondary",
                isSelected && "bg-primary text-primary-foreground",
                isInRange && !isSelected && "bg-secondary/60",
                !isInRange && "text-muted-foreground"
              )}
            >
              <span>{format(day, "d")}</span>
              {/* Dot indicators */}
              <div className="flex gap-0.5 mt-0.5 h-1.5">
                {coverage?.hasApplied && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                )}
                {coverage?.hasImported && !coverage?.hasApplied && (
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                )}
                {coverage && !coverage.hasData && !coverage.hasImported && (
                  <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-3 text-[10px] text-muted-foreground pt-1">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Applied
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" /> Imported
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-warning" /> Missing
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
}: {
  day: DailyMetrics;
  ledger?: LedgerEntry;
  onSaveLedger: (entry: LedgerEntry) => void;
  isSaving: boolean;
  avgHourlyRate: number;
}) {
  const [open, setOpen] = useState(false);
  const dateObj = parseISO(day.date);
  const label = format(dateObj, "EEE dd MMM");

  // Local form state
  const [covers, setCovers] = useState(ledger?.covers ?? 0);
  const [labourHours, setLabourHours] = useState(ledger?.labour_hours ?? 0);
  const [additionalExpenses, setAdditionalExpenses] = useState(ledger?.additional_expenses ?? 0);
  const [notes, setNotes] = useState(ledger?.notes ?? "");

  // Sync when ledger data loads
  useEffect(() => {
    if (ledger) {
      setCovers(ledger.covers);
      setLabourHours(ledger.labour_hours);
      setAdditionalExpenses(ledger.additional_expenses);
      setNotes(ledger.notes);
    }
  }, [ledger]);

  const labourCost = labourHours * avgHourlyRate;
  const labourPct = day.revenue > 0 ? (labourCost / day.revenue) * 100 : 0;
  const adjustedProfit = day.revenue - day.foodCost - labourCost - additionalExpenses;

  const statusLabel = getStatusLabel(day, ledger);
  const healthColor = getHealthColor(day, labourPct);

  const handleSave = () => {
    onSaveLedger({
      entry_date: day.date,
      location_id: null,
      covers,
      labour_hours: labourHours,
      additional_expenses: additionalExpenses,
      notes,
    });
    toast.success(`Saved ledger for ${label}`);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden transition-colors">
        <div className="flex">
          {/* Health bar */}
          <div className={cn("w-1 shrink-0 rounded-l-lg", healthColor)} />

          <div className="flex-1">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer select-none py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {open ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium text-sm">{label}</span>
                    <Badge variant={getStatusVariant(statusLabel)} className="text-[10px] px-1.5 py-0">
                      {statusLabel}
                    </Badge>
                  </div>
                  {day.hasData ? (
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-right">
                        <span className="text-muted-foreground mr-1">Rev</span>
                        <span className="font-medium">{formatCurrency(day.revenue)}</span>
                      </div>
                      <div className="text-right hidden sm:block">
                        <span className="text-muted-foreground mr-1">Orders</span>
                        <span className="font-medium">{day.orders}</span>
                      </div>
                      <div className="text-right hidden sm:block">
                        <span className="text-muted-foreground mr-1">Profit</span>
                        <span className={cn("font-medium", adjustedProfit >= 0 ? "text-success" : "text-destructive")}>
                          {formatCurrency(adjustedProfit)}
                        </span>
                      </div>
                      <div className="text-right hidden md:block">
                        <span className="text-muted-foreground mr-1">FC%</span>
                        <span className="font-medium">{day.foodCostPercent.toFixed(1)}%</span>
                      </div>
                      <div className="text-right hidden md:block">
                        <span className="text-muted-foreground mr-1">Lab%</span>
                        <span className="font-medium">{labourPct.toFixed(1)}%</span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <CardContent className="pt-0 pb-4 px-4 space-y-4">
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
                        onChange={(e) => setCovers(Number(e.target.value) || 0)}
                        className="h-8 text-sm"
                      />
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

                  {/* Computed metrics from inputs */}
                  {day.hasData && (
                    <div className="flex flex-wrap gap-4 text-xs pt-1">
                      <span>
                        <span className="text-muted-foreground">Labour Cost:</span>{" "}
                        <span className="font-medium">{formatCurrency(labourCost)}</span>
                      </span>
                      <span>
                        <span className="text-muted-foreground">Labour %:</span>{" "}
                        <span className="font-medium">{labourPct.toFixed(1)}%</span>
                      </span>
                      <span>
                        <span className="text-muted-foreground">Adj. Profit:</span>{" "}
                        <span className={cn("font-medium", adjustedProfit >= 0 ? "text-success" : "text-destructive")}>
                          {formatCurrency(adjustedProfit)}
                        </span>
                      </span>
                      {covers > 0 && (
                        <span>
                          <span className="text-muted-foreground">Rev/Cover:</span>{" "}
                          <span className="font-medium">{formatCurrency(day.revenue / covers)}</span>
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

                {!day.hasData && (
                  <p className="text-sm text-muted-foreground">No sales recorded for this day.</p>
                )}
              </CardContent>
            </CollapsibleContent>
          </div>
        </div>
      </Card>
    </Collapsible>
  );
}

// ─── Main Page ───
export default function ReportsPage() {
  const { selectedLocationId } = useLocation();
  const { startDate, endDate, presetLabel, setCustomRange } = useDateRange();
  const { data: metrics, isLoading } = useDashboardMetrics(startDate, endDate, selectedLocationId);
  const { data: dailyData, isLoading: dailyLoading } = useDailyBreakdown(
    startDate,
    endDate,
    selectedLocationId
  );
  const { entries: ledgerEntries, upsert: upsertLedger, isSaving } = useDailyLedger(
    startDate,
    endDate,
    selectedLocationId
  );

  // Approximate avg hourly rate (can be refined with staff query later)
  const avgHourlyRate = 12.5;

  // Reactive period summary that accounts for ledger data
  const periodSummary = useMemo(() => {
    if (!dailyData || dailyData.length === 0 || !metrics) {
      return {
        revenue: metrics?.totalRevenue || 0,
        orders: metrics?.totalOrders || 0,
        foodCostPct: metrics?.foodCostPercent || 0,
        profit: metrics?.totalProfit || 0,
        totalLabourCost: 0,
        labourPct: 0,
      };
    }

    let totalLabourCost = 0;
    let totalAdditionalExpenses = 0;

    for (const day of dailyData) {
      const ledger = ledgerEntries.get(day.date);
      if (ledger) {
        totalLabourCost += ledger.labour_hours * avgHourlyRate;
        totalAdditionalExpenses += ledger.additional_expenses;
      }
    }

    const revenue = metrics.totalRevenue;
    const foodCost = revenue * (metrics.foodCostPercent / 100);
    const adjustedProfit = revenue - foodCost - totalLabourCost - totalAdditionalExpenses;
    const labourPct = revenue > 0 ? (totalLabourCost / revenue) * 100 : 0;

    return {
      revenue,
      orders: metrics.totalOrders,
      foodCostPct: metrics.foodCostPercent,
      profit: adjustedProfit,
      totalLabourCost,
      labourPct,
    };
  }, [metrics, dailyData, ledgerEntries, avgHourlyRate]);

  const handleDayClick = useCallback(
    (dateStr: string) => {
      setCustomRange(dateStr, dateStr);
    },
    [setCustomRange]
  );

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
          </div>

          {isLoading ? (
            <div className="text-muted-foreground text-sm">Loading metrics…</div>
          ) : (
            <>
              {/* Period Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
                    <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="text-xl font-bold">{periodSummary.orders}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Food Cost %</CardTitle>
                    <Percent className="h-3.5 w-3.5 text-primary" />
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="text-xl font-bold">{periodSummary.foodCostPct.toFixed(1)}%</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Labour %</CardTitle>
                    <Users className="h-3.5 w-3.5 text-primary" />
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="text-xl font-bold">{periodSummary.labourPct.toFixed(1)}%</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Labour Cost</CardTitle>
                    <span className="text-xs text-primary font-medium">{currencySymbol}</span>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="text-xl font-bold">{formatCurrency(periodSummary.totalLabourCost)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Profit</CardTitle>
                    <TrendingUp className="h-3.5 w-3.5 text-success" />
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className={cn("text-xl font-bold", periodSummary.profit >= 0 ? "text-success" : "text-destructive")}>
                      {formatCurrency(periodSummary.profit)}
                    </div>
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
      </Tabs>
    </PageLayout>
  );
}
