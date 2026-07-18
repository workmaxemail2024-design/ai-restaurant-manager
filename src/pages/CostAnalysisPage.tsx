import { useMemo, useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useDishes, type Dish } from "@/hooks/useDishes";
import { useLocation } from "@/contexts/LocationContext";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, AlertTriangle, Sparkles, Loader2, Percent, AlertCircle, CheckCircle2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency, currencySymbol } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface DishCost {
  id: string;
  name: string;
  category: string;
  sellingPrice: number;
  cost: number | null;
  marginPercent: number | null;
  foodCostPercent: number | null;
  grossProfit: number | null;
  status: "costed" | "missing" | "direct" | "needs_review";
  useDirect: boolean;
  needsReview: boolean;
}

// Ordered category grouping
const CATEGORY_ORDER = [
  "Starters", "Appetizers",
  "Main Courses", "Mains",
  "Pizza", "Pasta",
  "Sides",
  "Desserts",
  "Soft Drinks", "Hot Drinks",
  "Alcoholic Drinks", "Wine", "Beer", "Cocktails", "Spirits",
  "Modifiers", "Modifier / Side",
  "Other", "Uncategorized",
];

function categoryRank(cat: string): number {
  const c = cat.toLowerCase();
  const idx = CATEGORY_ORDER.findIndex(o => c.includes(o.toLowerCase()));
  return idx === -1 ? 999 : idx;
}

function statusBadge(status: DishCost["status"]) {
  switch (status) {
    case "costed":
      return <Badge variant="secondary" className="bg-success/15 text-success">Costed</Badge>;
    case "direct":
      return <Badge variant="secondary" className="bg-primary/15 text-primary">Direct cost</Badge>;
    case "missing":
      return <Badge variant="secondary" className="bg-warning/15 text-warning">Missing cost</Badge>;
    case "needs_review":
      return <Badge variant="secondary" className="bg-warning/15 text-warning">Needs review</Badge>;
  }
}

export default function CostAnalysisPage() {
  const { selectedLocationId } = useLocation();
  const { data: dishes = [], isLoading, error: dishesError } = useDishes(selectedLocationId);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const dishCosts: DishCost[] = useMemo(() => {
    return dishes.map((d: Dish) => {
      const sellingPrice = Number(d.selling_price) || 0;
      const cost = d.dish_cost;
      const hasCost = cost !== null && cost !== undefined;
      const marginPercent = hasCost && sellingPrice > 0 ? ((sellingPrice - (cost as number)) / sellingPrice) * 100 : null;
      const foodCostPercent = hasCost && sellingPrice > 0 ? ((cost as number) / sellingPrice) * 100 : null;
      const grossProfit = hasCost ? sellingPrice - (cost as number) : null;
      let status: DishCost["status"] = "missing";
      if (d.needs_review) status = "needs_review";
      else if (hasCost && d.use_direct_cost) status = "direct";
      else if (hasCost) status = "costed";
      return {
        id: d.id,
        name: d.name,
        category: d.category || d.department || "Uncategorized",
        sellingPrice,
        cost: hasCost ? Number(cost) : null,
        marginPercent,
        foodCostPercent,
        grossProfit,
        status,
        useDirect: Boolean(d.use_direct_cost),
        needsReview: Boolean(d.needs_review),
      };
    });
  }, [dishes]);

  const costed = dishCosts.filter(d => d.cost !== null);
  const missing = dishCosts.filter(d => d.cost === null);
  const coverage = dishCosts.length > 0 ? (costed.length / dishCosts.length) * 100 : 0;

  const avgFoodCost = costed.length > 0
    ? costed.reduce((s, d) => s + (d.foodCostPercent || 0), 0) / costed.length
    : 0;
  const avgMargin = costed.length > 0
    ? costed.reduce((s, d) => s + (d.marginPercent || 0), 0) / costed.length
    : 0;
  const totalProfit = costed.reduce((s, d) => s + (d.grossProfit || 0), 0);

  const highCostItems = costed.filter(d => (d.foodCostPercent || 0) > 35);

  const topByMargin = [...costed]
    .sort((a, b) => (b.marginPercent || 0) - (a.marginPercent || 0))
    .slice(0, 10);

  const marginChartData = topByMargin.map(d => ({
    name: d.name.length > 12 ? d.name.substring(0, 12) + "…" : d.name,
    margin: d.marginPercent || 0,
    foodCost: d.foodCostPercent || 0,
  }));

  const grouped = useMemo(() => {
    const g: Record<string, DishCost[]> = {};
    for (const d of dishCosts) {
      (g[d.category] ??= []).push(d);
    }
    return Object.entries(g).sort(([a], [b]) => {
      const ra = categoryRank(a); const rb = categoryRank(b);
      return ra !== rb ? ra - rb : a.localeCompare(b);
    });
  }, [dishCosts]);

  const generateAIInsight = async () => {
    setLoadingInsight(true); setAiError(null);
    try {
      const response = await supabase.functions.invoke("ai-cost-analysis", {
        body: { dishCosts: costed, avgFoodCost, highCostItems },
      });
      if (response.error) throw new Error(response.error.message || "Failed to get AI analysis");
      if (response.data?.insight) setAiInsight(response.data.insight);
      else if (response.data?.error) throw new Error(response.data.error);
      else throw new Error("No insight returned from AI");
    } catch (error: any) {
      setAiError(error.message || "Failed to generate AI insight");
    } finally {
      setLoadingInsight(false);
    }
  };

  return (
    <PageLayout title="Cost Analysis" description="Real-time food cost tracking and margin analysis">
      <div className="space-y-6">
        {dishesError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error loading data</AlertTitle>
            <AlertDescription>{(dishesError as Error).message}</AlertDescription>
          </Alert>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading cost data...</span>
          </div>
        )}

        {!isLoading && !dishesError && dishes.length === 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No dishes found</AlertTitle>
            <AlertDescription>Add dishes to your menu to see cost analysis.</AlertDescription>
          </Alert>
        )}

        {!isLoading && dishes.length > 0 && (
          <>
            {/* Coverage warning */}
            {missing.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{missing.length} dishes are missing cost data</AlertTitle>
                <AlertDescription>
                  Averages, margins and "Top by Margin" exclude these items. Add ingredients or a direct cost from Menu / Dishes.
                </AlertDescription>
              </Alert>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2"><Percent className="h-4 w-4" /> Avg Food Cost</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{costed.length > 0 ? `${avgFoodCost.toFixed(1)}%` : "—"}</div>
                  <p className="text-xs text-muted-foreground">{costed.length} costed dishes · target 28–32%</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2"><TrendingUp className="h-4 w-4 text-success" /> Avg Margin</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{costed.length > 0 ? `${avgMargin.toFixed(1)}%` : "—"}</div>
                  <p className="text-xs text-muted-foreground">costed dishes only</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2"><span className="h-4 w-4 font-medium">{currencySymbol}</span> Potential profit</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(totalProfit)}</div>
                  <p className="text-xs text-muted-foreground">per unit sold (costed items)</p>
                </CardContent>
              </Card>
              <Card className={cn(missing.length > 0 && "border-warning")}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Cost coverage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{coverage.toFixed(0)}%</div>
                  <p className="text-xs text-muted-foreground">
                    {costed.length} costed · <span className="text-warning">{missing.length} missing</span>
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Top 10 Dishes by Margin</CardTitle>
                <CardDescription>Costed items only. Dishes without cost data are excluded.</CardDescription>
              </CardHeader>
              <CardContent>
                {marginChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={marginChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={80} />
                      <YAxis className="text-xs" />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                        formatter={(v: number, n: string) => [`${v.toFixed(1)}%`, n === "margin" ? "Margin" : "Food Cost"]}
                      />
                      <Bar dataKey="margin" name="Margin" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="foodCost" name="Food Cost" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                    No costed dishes yet. Add ingredients or a direct cost to see margins.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* High cost alerts */}
            {highCostItems.length > 0 && (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" /> High Cost Alerts ({highCostItems.length})
                  </CardTitle>
                  <CardDescription>Food cost above 35% — review portioning or pricing.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {highCostItems.map(item => (
                      <div key={item.id} className="p-3 rounded-lg bg-background border border-destructive/20 text-sm">
                        <div className="font-semibold">{item.name}</div>
                        <div className="text-muted-foreground text-xs">{item.category}</div>
                        <div className="mt-2 flex justify-between">
                          <span>Food cost</span>
                          <span className="font-medium text-destructive">{(item.foodCostPercent || 0).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Margin</span>
                          <span className="font-medium">{(item.marginPercent || 0).toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AI Insights */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> AI Cost Optimization</CardTitle>
                  <CardDescription>Get AI recommendations to improve margins</CardDescription>
                </div>
                <Button onClick={generateAIInsight} disabled={loadingInsight || costed.length === 0}>
                  {loadingInsight ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Analyze Costs
                </Button>
              </CardHeader>
              <CardContent>
                {aiError && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{aiError}</AlertDescription>
                  </Alert>
                )}
                {aiInsight ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">{aiInsight}</div>
                ) : !aiError ? (
                  <p className="text-muted-foreground text-sm">Click "Analyze Costs" to get AI recommendations.</p>
                ) : null}
              </CardContent>
            </Card>

            {/* Grouped table */}
            <Card>
              <CardHeader>
                <CardTitle>All Dishes — Grouped by Category</CardTitle>
                <CardDescription>Dishes with missing cost are shown but excluded from averages.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {grouped.map(([cat, items]) => {
                  const groupCosted = items.filter(i => i.cost !== null);
                  const groupAvg = groupCosted.length > 0
                    ? groupCosted.reduce((s, d) => s + (d.marginPercent || 0), 0) / groupCosted.length
                    : null;
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{cat}</h3>
                          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                          {items.length - groupCosted.length > 0 && (
                            <Badge variant="secondary" className="text-xs bg-warning/15 text-warning">
                              {items.length - groupCosted.length} missing cost
                            </Badge>
                          )}
                        </div>
                        {groupAvg !== null && (
                          <div className="text-xs text-muted-foreground">Avg margin: <span className="font-medium">{groupAvg.toFixed(1)}%</span></div>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-muted-foreground text-xs uppercase">
                              <th className="text-left py-2 font-medium">Dish</th>
                              <th className="text-right py-2 font-medium">Selling</th>
                              <th className="text-right py-2 font-medium">Cost</th>
                              <th className="text-right py-2 font-medium">Food %</th>
                              <th className="text-right py-2 font-medium">Margin %</th>
                              <th className="text-right py-2 font-medium">Gross</th>
                              <th className="text-right py-2 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map(d => (
                              <tr key={d.id} className="border-b hover:bg-muted/40">
                                <td className="py-2 font-medium">{d.name}</td>
                                <td className="py-2 text-right">{formatCurrency(d.sellingPrice)}</td>
                                <td className="py-2 text-right">
                                  {d.cost !== null ? formatCurrency(d.cost) : <span className="text-warning">Missing</span>}
                                </td>
                                <td className="py-2 text-right">
                                  {d.foodCostPercent !== null ? (
                                    <span className={cn(d.foodCostPercent > 35 && "text-destructive font-medium")}>{d.foodCostPercent.toFixed(1)}%</span>
                                  ) : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="py-2 text-right">
                                  {d.marginPercent !== null ? (
                                    <span className={cn(d.marginPercent < 50 ? "text-warning" : "text-success")}>{d.marginPercent.toFixed(1)}%</span>
                                  ) : <span className="text-warning">Incomplete</span>}
                                </td>
                                <td className="py-2 text-right">
                                  {d.grossProfit !== null ? formatCurrency(d.grossProfit) : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="py-2 text-right">{statusBadge(d.status)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PageLayout>
  );
}
