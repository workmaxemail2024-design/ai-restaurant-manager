import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "@/contexts/LocationContext";
import { useInventoryForecast, ForecastRow } from "@/hooks/useInventoryForecast";
import { confidenceLabel, wastageLabel, MIN_USAGE_DAYS } from "@/lib/inventoryStatus";
import {
  AlertTriangle,
  Package,
  Calendar,
  Sparkles,
  Loader2,
  BarChart3,
  CheckCircle2,
  CircleSlash,
  Info,
} from "lucide-react";
import { BarChart, Bar, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function ConfidenceBadge({ row }: { row: ForecastRow }) {
  if (row.confidence === "none") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Insufficient usage data
      </Badge>
    );
  }
  const variant = row.confidence === "high" ? "secondary" : "outline";
  return (
    <Badge variant={variant} className="capitalize">
      {confidenceLabel[row.confidence]}
    </Badge>
  );
}

export default function InventoryForecastPage() {
  const { selectedLocationId } = useLocation();
  const { data, isLoading } = useInventoryForecast(selectedLocationId);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  const rows = data?.rows ?? [];
  const daysWithData = data?.daysWithData ?? 0;
  const windowDays = data?.windowDays ?? 30;
  const prerequisites = data?.prerequisites ?? [];
  const missingPrereqs = prerequisites.filter((p) => !p.ok);

  // Only items with a real threshold can be low/critical.
  const criticalItems = rows.filter((r) => r.status.state === "critical");
  const lowItems = rows.filter((r) => r.status.state === "low");
  const wastageItems = rows.filter((r) => r.wastageRisk === "high");
  const forecastableItems = rows.filter((r) => r.daysUntilStockout !== null);
  const unforecastable = rows.length - forecastableItems.length;

  const chartData = [...forecastableItems]
    .sort((a, b) => (a.daysUntilStockout ?? 0) - (b.daysUntilStockout ?? 0))
    .slice(0, 10)
    .map((f) => ({
      name: f.name.length > 15 ? f.name.substring(0, 15) + "..." : f.name,
      days: Math.round(f.daysUntilStockout ?? 0),
      color:
        f.status.state === "critical"
          ? "hsl(var(--destructive))"
          : f.status.state === "low"
          ? "hsl(45 93% 47%)"
          : "hsl(var(--primary))",
    }));

  const generateAIInsight = async () => {
    setLoadingInsight(true);
    try {
      // Only send items we actually have evidence for.
      const response = await supabase.functions.invoke("ai-inventory-forecast", {
        body: {
          ingredients: forecastableItems.map((f) => ({
            ingredientId: f.id,
            name: f.name,
            currentStock: f.currentStock,
            unit: f.unit,
            avgDailyUsage: f.avgDailyUsage,
            recentUsage: [],
          })),
          daysWithData,
        },
      });
      setAiInsight(response.data?.insights || response.data?.insight || "No analysis returned.");
    } catch (error) {
      console.error("Error generating AI insight:", error);
      setAiInsight("Could not generate analysis right now.");
    } finally {
      setLoadingInsight(false);
    }
  };

  const sortedRows = [...rows].sort((a, b) => {
    const av = a.daysUntilStockout ?? Number.POSITIVE_INFINITY;
    const bv = b.daysUntilStockout ?? Number.POSITIVE_INFINITY;
    return av - bv;
  });

  return (
    <PageLayout
      title="Inventory Forecasting & Waste"
      subtitle="Forecasts derived from physical stock and theoretical usage — shown only where the data supports them"
    >
      <div className="space-y-6">
        {/* Data confidence & prerequisites */}
        <Card className={missingPrereqs.length > 0 ? "border-amber-500/50" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Info className="h-4 w-4" /> Forecast data confidence
            </CardTitle>
            <CardDescription>
              {daysWithData} of the last {windowDays} days have sales data. Usage-based figures need at
              least {MIN_USAGE_DAYS} days.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {prerequisites.map((p) => (
              <div key={p.key} className="flex items-start gap-2 text-sm">
                {p.ok ? (
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
                ) : (
                  <CircleSlash className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                )}
                <span>
                  <span className="font-medium">{p.label}: </span>
                  <span className="text-muted-foreground">{p.detail}</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Alert Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className={criticalItems.length > 0 ? "border-destructive bg-destructive/5" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" /> Critical Stock
              </CardTitle>
              <CardDescription>At or below half the reorder point</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{criticalItems.length}</div>
              {criticalItems.slice(0, 3).map((item) => (
                <Badge key={item.id} variant="destructive" className="mr-1 mt-1">
                  {item.name}
                </Badge>
              ))}
            </CardContent>
          </Card>

          <Card className={lowItems.length > 0 ? "border-amber-500/50 bg-amber-500/5" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Package className="h-4 w-4 text-amber-500" /> Low Stock
              </CardTitle>
              <CardDescription>At or below the configured reorder point</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{lowItems.length}</div>
              {lowItems.slice(0, 3).map((item) => (
                <Badge key={item.id} variant="outline" className="mr-1 mt-1 border-amber-500 text-amber-600">
                  {item.name}
                </Badge>
              ))}
            </CardContent>
          </Card>

          <Card className={wastageItems.length > 0 ? "border-orange-500/50 bg-orange-500/5" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Package className="h-4 w-4 text-orange-500" /> Wastage Risk
              </CardTitle>
              <CardDescription>Turnover slower than recorded shelf life</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{wastageItems.length}</div>
              {wastageItems.slice(0, 3).map((item) => (
                <Badge key={item.id} variant="outline" className="mr-1 mt-1 border-orange-500 text-orange-600">
                  {item.name}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Days Until Stockout Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" /> Days Until Stockout
            </CardTitle>
            <CardDescription>
              Only ingredients with enough usage history are shown
              {unforecastable > 0 ? ` — ${unforecastable} excluded for insufficient usage data` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[300px] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={120} className="text-xs" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    formatter={(value: number) => [`${value} days`, "Days until stockout"]}
                  />
                  <Bar dataKey="days" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex flex-col items-center justify-center text-center text-muted-foreground">
                <p>No ingredient has enough usage history to forecast a stockout date.</p>
                <p className="text-sm">
                  Record at least {MIN_USAGE_DAYS} days of sales and link dish recipes to ingredients.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Analysis */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" /> AI Analysis
              </CardTitle>
              <CardDescription>Based only on ingredients with sufficient usage history</CardDescription>
            </div>
            <Button onClick={generateAIInsight} disabled={loadingInsight || forecastableItems.length === 0}>
              {loadingInsight ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Generate Analysis
            </Button>
          </CardHeader>
          <CardContent>
            {forecastableItems.length === 0 ? (
              <p className="text-muted-foreground">
                Not enough usage data to analyse. Resolve the missing prerequisites above first.
              </p>
            ) : aiInsight ? (
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">{aiInsight}</div>
            ) : (
              <p className="text-muted-foreground">Click "Generate Analysis" to get AI recommendations.</p>
            )}
          </CardContent>
        </Card>

        {/* Detail table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" /> Stock & Reorder Detail
            </CardTitle>
            <CardDescription>
              Stock on hand is physical. Usage is recalculated from sales × recipes and never deducted
              from stock.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Ingredient</th>
                    <th className="text-right py-2">Stock on hand</th>
                    <th className="text-right py-2">Reorder point</th>
                    <th className="text-right py-2">Avg daily usage</th>
                    <th className="text-right py-2">Days left</th>
                    <th className="text-right py-2">Reorder to par</th>
                    <th className="text-center py-2">Confidence</th>
                    <th className="text-center py-2">Waste risk</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <tr key={row.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 font-medium">
                        {row.name}
                        {row.status.state === "critical" && (
                          <Badge variant="destructive" className="ml-2">Critical</Badge>
                        )}
                        {row.status.state === "low" && (
                          <Badge variant="outline" className="ml-2 border-amber-500 text-amber-600">Low</Badge>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono">
                        {row.currentStock.toFixed(2)} {row.unit}
                      </td>
                      <td className="py-2 text-right font-mono">
                        {row.reorderPoint !== null ? (
                          `${row.reorderPoint.toFixed(2)} ${row.unit}`
                        ) : (
                          <span className="text-xs text-muted-foreground font-sans">Not set</span>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono">
                        {row.avgDailyUsage !== null ? (
                          `${row.avgDailyUsage.toFixed(2)} ${row.unit}`
                        ) : (
                          <span className="text-xs text-muted-foreground font-sans">—</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {row.daysUntilStockout !== null ? (
                          <span
                            className={
                              row.status.state === "critical"
                                ? "text-destructive font-bold"
                                : row.status.state === "low"
                                ? "text-amber-600"
                                : ""
                            }
                          >
                            {Math.floor(row.daysUntilStockout)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Insufficient usage data</span>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono">
                        {row.reorderQty !== null ? (
                          <span className="text-primary">
                            {row.reorderQty.toFixed(2)} {row.unit}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground font-sans">
                            {row.parLevel === null ? "No par level" : "At par"}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-center">
                        <ConfidenceBadge row={row} />
                      </td>
                      <td className="py-2 text-center">
                        <span title={row.wastageReason}>
                          {row.wastageRisk === "not_assessed" ? (
                            <span className="text-xs text-muted-foreground">Not assessed</span>
                          ) : (
                            <Badge
                              variant={row.wastageRisk === "high" ? "destructive" : "secondary"}
                              className="capitalize"
                            >
                              {wastageLabel[row.wastageRisk]}
                            </Badge>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && !isLoading && (
                <p className="text-center py-8 text-muted-foreground">No ingredients recorded yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
