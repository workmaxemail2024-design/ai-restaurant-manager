import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useDishes } from "@/hooks/useDishes";
import { useLocation } from "@/contexts/LocationContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, AlertTriangle, Sparkles, Loader2, Percent, AlertCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency, currencySymbol } from "@/lib/currency";

interface DishCost {
  id: string;
  name: string;
  category: string;
  sellingPrice: number;
  cost: number;
  margin: number;
  marginPercent: number;
  foodCostPercent: number;
  grossProfit: number;
}

export default function CostAnalysisPage() {
  const { selectedLocationId } = useLocation();
  const { data: dishes = [], isLoading: dishesLoading, error: dishesError } = useDishes(selectedLocationId);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Calculate dish costs
  const { data: dishCosts = [], isLoading, error: costsError } = useQuery({
    queryKey: ["dish-costs", dishes, selectedLocationId],
    queryFn: async () => {
      if (dishes.length === 0) return [];

      const costs: DishCost[] = await Promise.all(
        dishes.map(async (dish) => {
          const { data: costData } = await supabase.rpc("calculate_dish_cost", { p_dish_id: dish.id });
          const cost = Number(costData) || 0;
          const sellingPrice = Number(dish.selling_price);
          const margin = sellingPrice - cost;
          const marginPercent = sellingPrice > 0 ? (margin / sellingPrice) * 100 : 0;
          const foodCostPercent = sellingPrice > 0 ? (cost / sellingPrice) * 100 : 0;

          return {
            id: dish.id,
            name: dish.name,
            category: dish.category || "Uncategorized",
            sellingPrice,
            cost,
            margin,
            marginPercent,
            foodCostPercent,
            grossProfit: margin,
          };
        })
      );

      return costs.sort((a, b) => b.marginPercent - a.marginPercent);
    },
    enabled: dishes.length > 0,
  });

  // Calculate averages
  const avgFoodCost = dishCosts.reduce((sum, d) => sum + d.foodCostPercent, 0) / dishCosts.length || 0;
  const avgMargin = dishCosts.reduce((sum, d) => sum + d.marginPercent, 0) / dishCosts.length || 0;
  const totalProfit = dishCosts.reduce((sum, d) => sum + d.grossProfit, 0);

  // Items with shrinking margins (food cost > 35%)
  const highCostItems = dishCosts.filter((d) => d.foodCostPercent > 35);
  const lowMarginItems = dishCosts.filter((d) => d.marginPercent < 50);

  // Chart data
  const marginChartData = dishCosts.slice(0, 10).map((d) => ({
    name: d.name.length > 12 ? d.name.substring(0, 12) + "..." : d.name,
    margin: d.marginPercent,
    foodCost: d.foodCostPercent,
  }));

  const generateAIInsight = async () => {
    setLoadingInsight(true);
    setAiError(null);
    try {
      const response = await supabase.functions.invoke("ai-cost-analysis", {
        body: { dishCosts, avgFoodCost, highCostItems },
      });
      
      if (response.error) {
        throw new Error(response.error.message || "Failed to get AI analysis");
      }
      
      if (response.data?.insight) {
        setAiInsight(response.data.insight);
      } else if (response.data?.error) {
        throw new Error(response.data.error);
      } else {
        throw new Error("No insight returned from AI");
      }
    } catch (error: any) {
      console.error("Error generating AI insight:", error);
      setAiError(error.message || "Failed to generate AI insight");
    } finally {
      setLoadingInsight(false);
    }
  };

  const dataLoading = dishesLoading || isLoading;
  const dataError = dishesError || costsError;

  return (
    <PageLayout
      title="Cost Analysis"
      description="Real-time food cost tracking and margin analysis"
    >
      <div className="space-y-6">
        {/* Error State */}
        {dataError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error loading data</AlertTitle>
            <AlertDescription>
              {(dataError as Error).message || "Failed to load dish data. Please try again."}
            </AlertDescription>
          </Alert>
        )}

        {/* Loading State */}
        {dataLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading cost data...</span>
          </div>
        )}

        {/* Empty State */}
        {!dataLoading && !dataError && dishes.length === 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No dishes found</AlertTitle>
            <AlertDescription>
              Add dishes to your menu to see cost analysis. {selectedLocationId ? "Try selecting 'All locations' to see more data." : ""}
            </AlertDescription>
          </Alert>
        )}

        {!dataLoading && dishes.length > 0 && (
          <>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Percent className="h-4 w-4" /> Avg Food Cost
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgFoodCost.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                Target: 28-32%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" /> Avg Margin
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgMargin.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                across all dishes
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <span className="h-4 w-4 font-medium">{currencySymbol}</span> Total Potential Profit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalProfit)}</div>
              <p className="text-xs text-muted-foreground">
                per unit sold
              </p>
            </CardContent>
          </Card>
          <Card className={highCostItems.length > 0 ? "border-destructive" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className={`h-4 w-4 ${highCostItems.length > 0 ? "text-destructive" : ""}`} /> 
                High Cost Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{highCostItems.length}</div>
              <p className="text-xs text-muted-foreground">
                dishes above 35% food cost
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Margin Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Dishes by Margin</CardTitle>
            <CardDescription>Margin % vs Food Cost %</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[300px] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : marginChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={marginChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={80} />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === "margin" ? "Margin" : "Food Cost"]}
                  />
                  <Bar dataKey="margin" name="Margin" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="foodCost" name="Food Cost" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No dish data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* High Cost Alerts */}
        {highCostItems.length > 0 && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" /> Margin Shrinkage Alerts
              </CardTitle>
              <CardDescription>These dishes have food costs above 35%</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {highCostItems.map((item) => (
                  <div key={item.id} className="p-4 rounded-lg bg-background border border-destructive/20">
                    <h4 className="font-semibold">{item.name}</h4>
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Food Cost:</span>
                        <span className="font-medium text-destructive">{item.foodCostPercent.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Margin:</span>
                        <span className="font-medium">{item.marginPercent.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cost:</span>
                        <span className="font-medium">{formatCurrency(item.cost)}</span>
                      </div>
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
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> AI Cost Optimization
              </CardTitle>
              <CardDescription>Get AI recommendations to improve margins</CardDescription>
            </div>
            <Button onClick={generateAIInsight} disabled={loadingInsight || dishCosts.length === 0}>
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
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                {aiInsight}
              </div>
            ) : !aiError ? (
              <p className="text-muted-foreground">Click "Analyze Costs" to get AI recommendations.</p>
            ) : null}
          </CardContent>
        </Card>

        {/* Detailed Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Dishes Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Dish</th>
                    <th className="text-left py-2">Category</th>
                    <th className="text-right py-2">Selling Price</th>
                    <th className="text-right py-2">Cost</th>
                    <th className="text-right py-2">Food Cost %</th>
                    <th className="text-right py-2">Margin %</th>
                    <th className="text-right py-2">Gross Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {dishCosts.map((dish) => (
                    <tr key={dish.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 font-medium">{dish.name}</td>
                      <td className="py-2">{dish.category}</td>
                      <td className="py-2 text-right">{formatCurrency(dish.sellingPrice)}</td>
                      <td className="py-2 text-right">{formatCurrency(dish.cost)}</td>
                      <td className="py-2 text-right">
                        <span className={dish.foodCostPercent > 35 ? "text-destructive font-medium" : ""}>
                          {dish.foodCostPercent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <span className={dish.marginPercent < 50 ? "text-yellow-600" : "text-green-600"}>
                          {dish.marginPercent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2 text-right font-medium">{formatCurrency(dish.grossProfit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
          </>
        )}
      </div>
    </PageLayout>
  );
}
