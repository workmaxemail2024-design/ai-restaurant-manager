import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Percent, ShoppingBag, FileText, Wallet } from "lucide-react";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { useLocation } from "@/contexts/LocationContext";
import { formatCurrency, currencySymbol } from "@/lib/currency";
import { ProfitLossReport } from "@/components/reports/ProfitLossReport";
import { CashFlowReport } from "@/components/reports/CashFlowReport";

export default function ReportsPage() {
  const { selectedLocationId } = useLocation();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const { data: metrics, isLoading } = useDashboardMetrics(date, selectedLocationId);

  return (
    <PageLayout title="Reports" subtitle="View business performance metrics and financial reports">
      <Tabs defaultValue="daily" className="space-y-6">
        <TabsList>
          <TabsTrigger value="daily" className="gap-2">
            <ShoppingBag className="h-4 w-4" />
            Daily Summary
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

        {/* Daily Summary Tab */}
        <TabsContent value="daily" className="space-y-6">
          <div className="mb-6">
            <Label htmlFor="date">Select Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-48"
            />
          </div>

          {isLoading ? (
            <div className="text-muted-foreground">Loading metrics...</div>
          ) : (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
                    <span className="h-4 w-4 text-primary font-medium">{currencySymbol}</span>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(metrics?.totalRevenue || 0)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Orders</CardTitle>
                    <ShoppingBag className="h-4 w-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metrics?.totalOrders || 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Food Cost %</CardTitle>
                    <Percent className="h-4 w-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metrics?.foodCostPercent.toFixed(1) || "0"}%</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Profit</CardTitle>
                    <TrendingUp className="h-4 w-4 text-success" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-success">{formatCurrency(metrics?.totalProfit || 0)}</div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Top Dishes */}
                <Card>
                  <CardHeader>
                    <CardTitle>Top 5 Dishes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!metrics?.topDishes.length ? (
                      <p className="text-muted-foreground">No sales data for this date</p>
                    ) : (
                      <div className="space-y-3">
                        {metrics.topDishes.map((dish, i) => (
                          <div key={i} className="flex justify-between items-center">
                            <span>{dish.name}</span>
                            <div className="text-right">
                              <span className="font-medium">{dish.quantity} sold</span>
                              <span className="text-muted-foreground ml-2">{formatCurrency(dish.revenue)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Worst Dishes */}
                <Card>
                  <CardHeader>
                    <CardTitle>Bottom 5 Dishes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!metrics?.worstDishes.length ? (
                      <p className="text-muted-foreground">No sales data for this date</p>
                    ) : (
                      <div className="space-y-3">
                        {metrics.worstDishes.map((dish, i) => (
                          <div key={i} className="flex justify-between items-center">
                            <span>{dish.name}</span>
                            <div className="text-right">
                              <span className="font-medium">{dish.quantity} sold</span>
                              <span className="text-muted-foreground ml-2">{formatCurrency(dish.revenue)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Location Performance */}
              <Card>
                <CardHeader>
                  <CardTitle>Location Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  {!metrics?.locationPerformance.length ? (
                    <p className="text-muted-foreground">No sales data for this date</p>
                  ) : (
                    <div className="space-y-3">
                      {metrics.locationPerformance.map((loc, i) => (
                        <div key={i} className="flex justify-between items-center p-3 rounded-lg bg-secondary/30">
                          <span className="font-medium">{loc.name}</span>
                          <div className="flex gap-8">
                            <div>
                              <span className="text-muted-foreground mr-2">Orders:</span>
                              <span className="font-medium">{loc.orders}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground mr-2">Revenue:</span>
                              <span className="font-medium text-success">{formatCurrency(loc.revenue)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
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
