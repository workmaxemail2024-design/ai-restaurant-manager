import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  TrendingUp,
  Percent,
  ShoppingBag,
  FileText,
  Wallet,
  ChevronDown,
  ChevronRight,
  Calendar,
  MapPin,
} from "lucide-react";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { useDailyBreakdown, type DailyMetrics } from "@/hooks/useDailyBreakdown";
import { useLocation } from "@/contexts/LocationContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { formatCurrency, currencySymbol } from "@/lib/currency";
import { ProfitLossReport } from "@/components/reports/ProfitLossReport";
import { CashFlowReport } from "@/components/reports/CashFlowReport";
import { format, parseISO } from "date-fns";

function DayCard({ day }: { day: DailyMetrics }) {
  const [open, setOpen] = useState(false);
  const dateObj = parseISO(day.date);
  const label = format(dateObj, "EEE dd MMM");

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="transition-colors">
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
                <div className="flex gap-1.5">
                  {day.hasApplied && (
                    <Badge variant="default" className="text-[10px] px-1.5 py-0">
                      Applied
                    </Badge>
                  )}
                  {day.hasImported && !day.hasApplied && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      Imported
                    </Badge>
                  )}
                  {!day.hasData && !day.hasImported && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                      No Data
                    </Badge>
                  )}
                </div>
              </div>
              {day.hasData ? (
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-right">
                    <span className="text-muted-foreground mr-1.5">Rev</span>
                    <span className="font-medium">{formatCurrency(day.revenue)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground mr-1.5">Orders</span>
                    <span className="font-medium">{day.orders}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground mr-1.5">Profit</span>
                    <span className="font-medium text-success">{formatCurrency(day.profit)}</span>
                  </div>
                  <div className="text-right hidden sm:block">
                    <span className="text-muted-foreground mr-1.5">FC%</span>
                    <span className="font-medium">{day.foodCostPercent.toFixed(1)}%</span>
                  </div>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {day.hasData ? (
            <CardContent className="pt-0 pb-4 px-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Top Dishes */}
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

                {/* Bottom Dishes */}
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

              {/* Location Performance */}
              {day.locationPerformance.length > 1 && (
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
            </CardContent>
          ) : (
            <CardContent className="pt-0 pb-4 px-4">
              <p className="text-sm text-muted-foreground">No sales recorded for this day.</p>
            </CardContent>
          )}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function ReportsPage() {
  const { selectedLocationId } = useLocation();
  const { startDate, endDate, presetLabel } = useDateRange();
  const { data: metrics, isLoading } = useDashboardMetrics(startDate, endDate, selectedLocationId);
  const { data: dailyData, isLoading: dailyLoading } = useDailyBreakdown(
    startDate,
    endDate,
    selectedLocationId
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

        {/* Period Summary Tab */}
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Revenue
                    </CardTitle>
                    <span className="h-4 w-4 text-primary font-medium">{currencySymbol}</span>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(metrics?.totalRevenue || 0)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Orders
                    </CardTitle>
                    <ShoppingBag className="h-4 w-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metrics?.totalOrders || 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Food Cost %
                    </CardTitle>
                    <Percent className="h-4 w-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {metrics?.foodCostPercent.toFixed(1) || "0"}%
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Profit
                    </CardTitle>
                    <TrendingUp className="h-4 w-4 text-success" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-success">
                      {formatCurrency(metrics?.totalProfit || 0)}
                    </div>
                  </CardContent>
                </Card>
              </div>

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
                      <DayCard key={day.date} day={day} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </TabsContent>

        {/* Profit & Loss Tab */}
        <TabsContent value="pnl">
          <ProfitLossReport />
        </TabsContent>

        {/* Cash Flow Tab */}
        <TabsContent value="cashflow">
          <CashFlowReport />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
