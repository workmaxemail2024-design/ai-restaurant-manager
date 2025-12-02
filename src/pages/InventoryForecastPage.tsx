import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIngredients } from "@/hooks/useIngredients";
import { useStockLevels } from "@/hooks/useStock";
import { useSales } from "@/hooks/useSales";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, TrendingDown, Package, Calendar, Sparkles, Loader2, BarChart3 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { format, subDays, addDays, parseISO } from "date-fns";

interface IngredientForecast {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  avgDailyUsage: number;
  daysUntilStockout: number;
  predicted7Days: number;
  predicted14Days: number;
  predicted30Days: number;
  reorderSuggestion: number;
  wastageRisk: "low" | "medium" | "high";
  shrinkageAlert: boolean;
}

export default function InventoryForecastPage() {
  const { data: ingredients = [] } = useIngredients();
  const { data: stockLevels = [] } = useStockLevels();
  const { data: sales = [] } = useSales();
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  // Calculate forecasts
  const { data: forecasts = [], isLoading } = useQuery({
    queryKey: ["inventory-forecasts", ingredients, stockLevels, sales, selectedLocation],
    queryFn: async () => {
      if (ingredients.length === 0) return [];

      // Get dish ingredients for usage calculation
      const { data: dishIngredients } = await supabase
        .from("dish_ingredients")
        .select("*, dishes(id)");

      const forecasts: IngredientForecast[] = ingredients.map((ingredient) => {
        // Get current stock
        const stockRecords = stockLevels.filter(
          (s) => s.ingredient_id === ingredient.id && (!selectedLocation || s.location_id === selectedLocation)
        );
        const currentStock = stockRecords.reduce((sum, s) => sum + Number(s.quantity), 0);

        // Calculate usage from sales (last 30 days)
        const thirtyDaysAgo = subDays(new Date(), 30).toISOString().split("T")[0];
        const recentSales = sales.filter((s) => s.sale_date >= thirtyDaysAgo);
        
        let totalUsage = 0;
        recentSales.forEach((sale) => {
          const dishIngredient = dishIngredients?.find(
            (di) => di.dishes?.id === sale.dish_id && di.ingredient_id === ingredient.id
          );
          if (dishIngredient) {
            totalUsage += Number(dishIngredient.quantity) * sale.quantity;
          }
        });

        const avgDailyUsage = totalUsage / 30;
        const daysUntilStockout = avgDailyUsage > 0 ? Math.floor(currentStock / avgDailyUsage) : 999;

        // Predictions (simple linear projection with 10% buffer)
        const predicted7Days = avgDailyUsage * 7 * 1.1;
        const predicted14Days = avgDailyUsage * 14 * 1.1;
        const predicted30Days = avgDailyUsage * 30 * 1.1;

        // Reorder suggestion (2 weeks supply)
        const reorderSuggestion = Math.max(0, predicted14Days - currentStock);

        // Wastage risk based on stock turnover
        const wastageRisk: "low" | "medium" | "high" = 
          daysUntilStockout > 60 ? "high" :
          daysUntilStockout > 30 ? "medium" : "low";

        // Shrinkage alert if actual usage differs significantly from expected
        const shrinkageAlert = false; // Would need more data to calculate

        return {
          id: ingredient.id,
          name: ingredient.name,
          unit: ingredient.unit,
          currentStock,
          avgDailyUsage,
          daysUntilStockout,
          predicted7Days,
          predicted14Days,
          predicted30Days,
          reorderSuggestion,
          wastageRisk,
          shrinkageAlert,
        };
      });

      return forecasts.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
    },
    enabled: ingredients.length > 0,
  });

  // Items at risk
  const criticalItems = forecasts.filter((f) => f.daysUntilStockout <= 7);
  const warningItems = forecasts.filter((f) => f.daysUntilStockout > 7 && f.daysUntilStockout <= 14);
  const highWastageItems = forecasts.filter((f) => f.wastageRisk === "high");

  // Chart data
  const stockoutChartData = forecasts.slice(0, 10).map((f) => ({
    name: f.name.length > 15 ? f.name.substring(0, 15) + "..." : f.name,
    days: Math.min(f.daysUntilStockout, 60),
    color: f.daysUntilStockout <= 7 ? "hsl(var(--destructive))" : 
           f.daysUntilStockout <= 14 ? "hsl(var(--warning, 45 93% 47%))" : "hsl(var(--primary))",
  }));

  const generateAIInsight = async () => {
    setLoadingInsight(true);
    try {
      const response = await supabase.functions.invoke("ai-inventory-forecast", {
        body: { forecasts, criticalItems, highWastageItems },
      });
      if (response.data?.insight) {
        setAiInsight(response.data.insight);
      }
    } catch (error) {
      console.error("Error generating AI insight:", error);
    } finally {
      setLoadingInsight(false);
    }
  };

  return (
    <PageLayout
      title="Inventory Forecasting & Waste"
      description="AI-powered inventory predictions and waste detection"
    >
      <div className="space-y-6">
        {/* Alert Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className={criticalItems.length > 0 ? "border-destructive bg-destructive/5" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" /> Critical Stock
              </CardTitle>
              <CardDescription>Items running out in 7 days</CardDescription>
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
          <Card className={warningItems.length > 0 ? "border-yellow-500/50 bg-yellow-500/5" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-yellow-500" /> Low Stock Warning
              </CardTitle>
              <CardDescription>Items running out in 14 days</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{warningItems.length}</div>
              {warningItems.slice(0, 3).map((item) => (
                <Badge key={item.id} variant="outline" className="mr-1 mt-1 border-yellow-500 text-yellow-600">
                  {item.name}
                </Badge>
              ))}
            </CardContent>
          </Card>
          <Card className={highWastageItems.length > 0 ? "border-orange-500/50 bg-orange-500/5" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Package className="h-4 w-4 text-orange-500" /> High Wastage Risk
              </CardTitle>
              <CardDescription>Items with slow turnover</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{highWastageItems.length}</div>
              {highWastageItems.slice(0, 3).map((item) => (
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
            <CardDescription>Top 10 items closest to running out</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[300px] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : stockoutChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stockoutChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" domain={[0, 60]} />
                  <YAxis type="category" dataKey="name" width={120} className="text-xs" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    formatter={(value: number) => [`${value} days`, "Days until stockout"]}
                  />
                  <Bar dataKey="days" radius={[0, 4, 4, 0]}>
                    {stockoutChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No inventory data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Insights */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> AI Forecast Analysis
              </CardTitle>
              <CardDescription>Get AI-powered inventory recommendations</CardDescription>
            </div>
            <Button onClick={generateAIInsight} disabled={loadingInsight || forecasts.length === 0}>
              {loadingInsight ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Generate Analysis
            </Button>
          </CardHeader>
          <CardContent>
            {aiInsight ? (
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                {aiInsight}
              </div>
            ) : (
              <p className="text-muted-foreground">Click "Generate Analysis" to get AI recommendations.</p>
            )}
          </CardContent>
        </Card>

        {/* Reorder Calendar */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" /> Reorder Suggestions
            </CardTitle>
            <CardDescription>Recommended quantities to maintain 2-week supply</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Ingredient</th>
                    <th className="text-right py-2">Current Stock</th>
                    <th className="text-right py-2">Avg Daily Usage</th>
                    <th className="text-right py-2">Days Left</th>
                    <th className="text-right py-2">7-Day Need</th>
                    <th className="text-right py-2">Reorder Qty</th>
                    <th className="text-center py-2">Waste Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {forecasts.map((forecast) => (
                    <tr key={forecast.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 font-medium">{forecast.name}</td>
                      <td className="py-2 text-right">{forecast.currentStock.toFixed(2)} {forecast.unit}</td>
                      <td className="py-2 text-right">{forecast.avgDailyUsage.toFixed(2)} {forecast.unit}</td>
                      <td className="py-2 text-right">
                        <span className={
                          forecast.daysUntilStockout <= 7 ? "text-destructive font-bold" :
                          forecast.daysUntilStockout <= 14 ? "text-yellow-600" : ""
                        }>
                          {forecast.daysUntilStockout > 90 ? "90+" : forecast.daysUntilStockout}
                        </span>
                      </td>
                      <td className="py-2 text-right">{forecast.predicted7Days.toFixed(2)} {forecast.unit}</td>
                      <td className="py-2 text-right font-medium">
                        {forecast.reorderSuggestion > 0 && (
                          <span className="text-primary">{forecast.reorderSuggestion.toFixed(2)} {forecast.unit}</span>
                        )}
                      </td>
                      <td className="py-2 text-center">
                        <Badge variant={
                          forecast.wastageRisk === "high" ? "destructive" :
                          forecast.wastageRisk === "medium" ? "outline" : "secondary"
                        } className="capitalize">
                          {forecast.wastageRisk}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
