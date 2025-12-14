import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { useStockLevels } from "@/hooks/useStock";
import { useIngredients } from "@/hooks/useIngredients";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { 
  Sparkles, Loader2, TrendingUp, TrendingDown, Euro, 
  Percent, ShoppingCart, AlertTriangle, CheckCircle, ChefHat,
  Users, Package
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/currency";

export default function AIDailySummaryPage() {
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics(yesterday);
  const { data: stockLevels = [] } = useStockLevels();
  const { data: ingredients = [] } = useIngredients();
  
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [recommendations, setRecommendations] = useState<string[]>([]);

  // Calculate stock-out warnings
  const lowStockItems = ingredients.filter((ingredient) => {
    const stock = stockLevels.find((s) => s.ingredient_id === ingredient.id);
    return stock && Number(stock.quantity) < 10;
  });

  const generateDailySummary = async () => {
    setLoadingSummary(true);
    try {
      const response = await supabase.functions.invoke("ai-daily-summary", {
        body: {
          metrics,
          lowStockItems: lowStockItems.map((i) => i.name),
          date: yesterday,
        },
      });
      if (response.data?.summary) {
        setAiSummary(response.data.summary);
        setRecommendations(response.data.recommendations || []);
      }
    } catch (error) {
      console.error("Error generating daily summary:", error);
    } finally {
      setLoadingSummary(false);
    }
  };

  // Trend chart data (mock - would come from historical data)
  const trendData = Array.from({ length: 7 }, (_, i) => ({
    day: format(subDays(new Date(), 7 - i), "EEE"),
    revenue: Math.random() * 5000 + 2000,
    profit: Math.random() * 2000 + 500,
  }));

  return (
    <PageLayout
      title="AI Daily Summary"
      description={`Operations summary for ${format(new Date(yesterday), "MMMM d, yyyy")}`}
    >
      <div className="space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Yesterday's Revenue</CardTitle>
              <Euro className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metricsLoading ? "..." : formatCurrency(metrics?.totalRevenue || 0)}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-green-500" /> +12% from last week
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Food Cost %</CardTitle>
              <Percent className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metricsLoading ? "..." : metrics?.foodCostPercent.toFixed(1) || "0"}%
              </div>
              <p className="text-xs text-muted-foreground">
                Target: 28-32%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Profit</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metricsLoading ? "..." : formatCurrency(metrics?.totalProfit || 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                Gross profit margin
              </p>
            </CardContent>
          </Card>
          <Card className={lowStockItems.length > 0 ? "border-destructive" : ""}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Stock Alerts</CardTitle>
              <AlertTriangle className={`h-4 w-4 ${lowStockItems.length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{lowStockItems.length}</div>
              <p className="text-xs text-muted-foreground">
                items running low
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Revenue Trend */}
        <Card>
          <CardHeader>
            <CardTitle>7-Day Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="day" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--primary))" strokeWidth={2} />
                <Line type="monotone" dataKey="profit" name="Profit" stroke="hsl(var(--accent))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top & Bottom Dishes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <TrendingUp className="h-5 w-5" /> Top Performing Dishes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {metricsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
                </div>
              ) : metrics?.topDishes.length ? (
                <div className="space-y-2">
                  {metrics.topDishes.map((dish, i) => (
                    <div key={dish.name} className="flex items-center justify-between p-2 rounded bg-green-500/5 border border-green-500/20">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-green-600">#{i + 1}</span>
                        <span className="font-medium">{dish.name}</span>
                      </div>
                      <div className="text-right text-sm">
                        <div className="font-medium">{dish.quantity} sold</div>
                        <div className="text-muted-foreground">{formatCurrency(dish.revenue)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No sales data for yesterday</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <TrendingDown className="h-5 w-5" /> Underperforming Dishes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {metricsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
                </div>
              ) : metrics?.worstDishes.length ? (
                <div className="space-y-2">
                  {metrics.worstDishes.map((dish) => (
                    <div key={dish.name} className="flex items-center justify-between p-2 rounded bg-red-500/5 border border-red-500/20">
                      <span className="font-medium">{dish.name}</span>
                      <div className="text-right text-sm">
                        <div className="font-medium">{dish.quantity} sold</div>
                        <div className="text-muted-foreground">{formatCurrency(dish.revenue)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No sales data for yesterday</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Stock Warnings */}
        {lowStockItems.length > 0 && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Package className="h-5 w-5" /> Low Stock Warnings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {lowStockItems.map((item) => (
                  <Badge key={item.id} variant="destructive">{item.name}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> AI Daily Briefing
              </CardTitle>
              <CardDescription>Comprehensive analysis of yesterday's operations</CardDescription>
            </div>
            <Button onClick={generateDailySummary} disabled={loadingSummary}>
              {loadingSummary ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Generate Summary
            </Button>
          </CardHeader>
          <CardContent>
            {aiSummary ? (
              <div className="space-y-4">
                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                  {aiSummary}
                </div>
                {recommendations.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" /> Recommended Actions
                    </h4>
                    <ul className="space-y-2">
                      {recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-primary font-bold">{i + 1}.</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Click "Generate Summary" to get your AI-powered daily briefing.</p>
            )}
          </CardContent>
        </Card>

        {/* Location Performance */}
        {metrics?.locationPerformance && metrics.locationPerformance.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ChefHat className="h-5 w-5" /> Location Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {metrics.locationPerformance.map((location) => (
                  <div key={location.name} className="p-4 rounded-lg bg-muted/50 border">
                    <h4 className="font-semibold">{location.name}</h4>
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Revenue:</span>
                        <span className="font-medium">{formatCurrency(location.revenue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Orders:</span>
                        <span className="font-medium">{location.orders}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
