import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDishes } from "@/hooks/useDishes";
import { useSales } from "@/hooks/useSales";
import { useLocation } from "@/contexts/LocationContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Star, TrendingUp, TrendingDown, HelpCircle, Dog, Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { formatCurrency } from "@/lib/currency";

interface DishAnalysis {
  id: string;
  name: string;
  category: string;
  sellingPrice: number;
  /** null = dish has no reliable recipe/direct cost. Never treated as 0. */
  cost: number | null;
  margin: number | null;
  marginPercent: number | null;
  salesVolume: number;
  revenue: number;
  contribution: number | null;
  classification: "star" | "plowhorse" | "puzzle" | "dog" | "uncosted";
}

export default function MenuEngineeringPage() {
  const { selectedLocationId } = useLocation();
  const { data: dishes = [] } = useDishes(selectedLocationId);
  const { data: sales = [] } = useSales(undefined, undefined, selectedLocationId);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  // Calculate dish analysis with costs
  const { data: dishAnalysis = [], isLoading } = useQuery({
    queryKey: ["menu-engineering", dishes, sales, selectedLocationId],
    queryFn: async () => {
      if (dishes.length === 0) return [];

      const analysis: DishAnalysis[] = await Promise.all(
        dishes.map(async (dish) => {
          // Get dish cost
          const { data: costData } = await supabase.rpc("calculate_dish_cost", { p_dish_id: dish.id });
          // NULL / 0 means "no reliable cost" — never treat it as a zero-cost dish,
          // that would show a ~100% margin and inflate the averages.
          const cost: number | null =
            costData === null || costData === undefined || Number(costData) <= 0
              ? null
              : Number(costData);
          
          // Get sales volume
          const dishSales = sales.filter((s) => s.dish_id === dish.id);
          const salesVolume = dishSales.reduce((sum, s) => sum + s.quantity, 0);
          const revenue = dishSales.reduce((sum, s) => sum + Number(s.total_price), 0);
          
          const margin = cost === null ? null : Number(dish.selling_price) - cost;
          const marginPercent =
            margin === null || Number(dish.selling_price) <= 0
              ? null
              : (margin / Number(dish.selling_price)) * 100;
          const contribution = margin === null ? null : margin * salesVolume;

          return {
            id: dish.id,
            name: dish.name,
            category: dish.category || "Uncategorized",
            sellingPrice: Number(dish.selling_price),
            cost,
            margin,
            marginPercent,
            salesVolume,
            revenue,
            contribution,
            classification: "star" as const, // Will be calculated below
          };
        })
      );

      // Averages are built ONLY from dishes with a real cost.
      const costed = analysis.filter((d) => d.marginPercent !== null);
      const avgMargin = costed.length
        ? costed.reduce((sum, d) => sum + (d.marginPercent as number), 0) / costed.length
        : 0;
      const avgVolume = costed.length
        ? costed.reduce((sum, d) => sum + d.salesVolume, 0) / costed.length
        : 0;

      // Classify dishes — uncosted dishes are never classified.
      return analysis.map((dish) => ({
        ...dish,
        classification:
          dish.marginPercent === null ? "uncosted" :
          dish.marginPercent >= avgMargin && dish.salesVolume >= avgVolume ? "star" :
          dish.marginPercent < avgMargin && dish.salesVolume >= avgVolume ? "plowhorse" :
          dish.marginPercent >= avgMargin && dish.salesVolume < avgVolume ? "puzzle" :
          "dog"
      }));
    },
    enabled: dishes.length > 0,
  });

  const getClassificationIcon = (classification: string) => {
    switch (classification) {
      case "star": return <Star className="h-4 w-4 text-yellow-500" />;
      case "plowhorse": return <TrendingUp className="h-4 w-4 text-blue-500" />;
      case "puzzle": return <HelpCircle className="h-4 w-4 text-purple-500" />;
      case "dog": return <Dog className="h-4 w-4 text-gray-500" />;
      case "uncosted": return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      default: return null;
    }
  };

  const getClassificationColor = (classification: string) => {
    switch (classification) {
      case "star": return "#eab308";
      case "plowhorse": return "#3b82f6";
      case "puzzle": return "#a855f7";
      case "dog": return "#6b7280";
      default: return "#6b7280";
    }
  };

  const getClassificationBadge = (classification: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      star: "default",
      plowhorse: "secondary",
      puzzle: "outline",
      dog: "destructive",
      uncosted: "outline",
    };
    return variants[classification] || "secondary";
  };

  // Group by classification
  const stars = dishAnalysis.filter((d) => d.classification === "star");
  const plowhorses = dishAnalysis.filter((d) => d.classification === "plowhorse");
  const puzzles = dishAnalysis.filter((d) => d.classification === "puzzle");
  const dogs = dishAnalysis.filter((d) => d.classification === "dog");

  // Cost coverage — uncosted dishes are excluded from every average below.
  const costedDishes = dishAnalysis.filter((d) => d.marginPercent !== null);
  const uncostedDishes = dishAnalysis.filter((d) => d.marginPercent === null);
  const coveragePct = dishAnalysis.length
    ? (costedDishes.length / dishAnalysis.length) * 100
    : 0;
  const isEstimated = dishAnalysis.length > 0 && uncostedDishes.length > 0;

  // Calculate averages for reference lines (costed dishes only)
  const avgMargin = costedDishes.length
    ? costedDishes.reduce((sum, d) => sum + (d.marginPercent as number), 0) / costedDishes.length
    : 0;
  const avgVolume = costedDishes.length
    ? costedDishes.reduce((sum, d) => sum + d.salesVolume, 0) / costedDishes.length
    : 0;

  const generateAIInsight = async () => {
    setLoadingInsight(true);
    try {
      const response = await supabase.functions.invoke("ai-menu-analysis", {
        body: { dishes: costedDishes },
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
      title="AI Menu Engineering"
      description="Analyze menu performance using BCG matrix methodology"
    >
      <div className="space-y-6">
        {/* Cost coverage — profitability is only as good as recipe coverage */}
        {dishAnalysis.length > 0 && (
          <div
            className={
              isEstimated
                ? "rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
                : "rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground"
            }
          >
            <div className="flex items-start gap-2">
              {isEstimated && <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />}
              <div>
                <span className="font-medium">
                  Cost coverage: {coveragePct.toFixed(0)}% ({costedDishes.length} of {dishAnalysis.length} dishes costed)
                </span>
                {isEstimated && (
                  <p className="text-muted-foreground mt-1">
                    {uncostedDishes.length} dish{uncostedDishes.length === 1 ? "" : "es"} have no reliable
                    recipe cost. They are excluded from margins, averages and classification, so all
                    profitability figures on this page are <strong>Estimated</strong> until coverage reaches 100%.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-yellow-500/50 bg-yellow-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500" /> Stars
              </CardTitle>
              <CardDescription>High margin, high volume</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stars.length}</div>
              <p className="text-xs text-muted-foreground">dishes to promote</p>
            </CardContent>
          </Card>
          <Card className="border-blue-500/50 bg-blue-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" /> Plowhorses
              </CardTitle>
              <CardDescription>Low margin, high volume</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{plowhorses.length}</div>
              <p className="text-xs text-muted-foreground">dishes to re-engineer</p>
            </CardContent>
          </Card>
          <Card className="border-purple-500/50 bg-purple-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-purple-500" /> Puzzles
              </CardTitle>
              <CardDescription>High margin, low volume</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{puzzles.length}</div>
              <p className="text-xs text-muted-foreground">dishes to market better</p>
            </CardContent>
          </Card>
          <Card className="border-gray-500/50 bg-gray-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Dog className="h-4 w-4 text-gray-500" /> Dogs
              </CardTitle>
              <CardDescription>Low margin, low volume</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dogs.length}</div>
              <p className="text-xs text-muted-foreground">consider removing</p>
            </CardContent>
          </Card>
        </div>

        {/* BCG Matrix Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Menu Engineering Matrix</CardTitle>
            <CardDescription>Dishes plotted by margin % vs sales volume</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[400px] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : costedDishes.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    type="number" 
                    dataKey="salesVolume" 
                    name="Sales Volume" 
                    label={{ value: "Sales Volume", position: "bottom" }}
                  />
                  <YAxis 
                    type="number" 
                    dataKey="marginPercent" 
                    name="Margin %" 
                    label={{ value: "Margin %", angle: -90, position: "left" }}
                  />
                  <ReferenceLine x={avgVolume} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" />
                  <ReferenceLine y={avgMargin} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    formatter={(value: number, name: string) => [
                      name === "marginPercent" ? `${value.toFixed(1)}%` : value,
                      name === "marginPercent" ? "Margin" : "Volume"
                    ]}
                    labelFormatter={(_, payload) => payload[0]?.payload?.name || ""}
                  />
                  <Scatter data={dishAnalysis}>
                    {dishAnalysis.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getClassificationColor(entry.classification)} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                No dish data available. Add dishes and sales to see analysis.
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Insights */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> AI Recommendations
              </CardTitle>
              <CardDescription>Get AI-powered insights for menu optimization</CardDescription>
            </div>
            <Button onClick={generateAIInsight} disabled={loadingInsight || dishAnalysis.length === 0}>
              {loadingInsight ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Generate Insights
            </Button>
          </CardHeader>
          <CardContent>
            {aiInsight ? (
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                {aiInsight}
              </div>
            ) : (
              <p className="text-muted-foreground">Click "Generate Insights" to get AI recommendations for your menu.</p>
            )}
          </CardContent>
        </Card>

        {/* Detailed Dish Table */}
        <Card>
          <CardHeader>
            <CardTitle>Detailed Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Dish</th>
                    <th className="text-left py-2">Category</th>
                    <th className="text-right py-2">Price</th>
                    <th className="text-right py-2">Cost</th>
                    <th className="text-right py-2">Margin %</th>
                    <th className="text-right py-2">Volume</th>
                    <th className="text-right py-2">Contribution</th>
                    <th className="text-center py-2">Class</th>
                  </tr>
                </thead>
                <tbody>
                  {dishAnalysis.map((dish) => (
                    <tr key={dish.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 font-medium">{dish.name}</td>
                      <td className="py-2">{dish.category}</td>
                      <td className="py-2 text-right">{formatCurrency(dish.sellingPrice)}</td>
                      <td className="py-2 text-right">
                        {dish.cost === null ? <span className="text-muted-foreground">—</span> : formatCurrency(dish.cost)}
                      </td>
                      <td className="py-2 text-right">
                        {dish.marginPercent === null ? (
                          <span className="text-muted-foreground">Unknown</span>
                        ) : (
                          `${dish.marginPercent.toFixed(1)}%`
                        )}
                      </td>
                      <td className="py-2 text-right">{dish.salesVolume}</td>
                      <td className="py-2 text-right">
                        {dish.contribution === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          formatCurrency(dish.contribution)
                        )}
                      </td>
                      <td className="py-2 text-center">
                        <Badge variant={getClassificationBadge(dish.classification)} className="capitalize flex items-center gap-1 w-fit mx-auto">
                          {getClassificationIcon(dish.classification)}
                          {dish.classification}
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
