import { PageLayout } from "@/components/common/PageLayout";
import { RequirePermission } from "@/components/RequirePermission";
import { AIInsightCard } from "@/components/ai/AIInsightCard";
import { AIInsightSection } from "@/components/ai/AIInsightSection";
import { useAIInsights } from "@/hooks/useAIInsights";
import { useOwnerIntelligence, type OwnerInsight, type InsightSeverity } from "@/hooks/useOwnerIntelligence";
import { useLocation } from "@/contexts/LocationContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { 
  Package, 
  Euro, 
  AlertTriangle,
  Users,
  ShoppingCart,
  Target,
  Zap,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  Shield,
  BarChart3,
  MapPin,
  CalendarDays,
  UtensilsCrossed,
} from "lucide-react";
import { Link } from "react-router-dom";

function InsightCTA({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to}>
      <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-primary hover:text-primary hover:bg-primary/10 mt-2 h-7 px-2">
        {label}
        <ArrowRight className="h-3 w-3" />
      </Button>
    </Link>
  );
}

const severityStyles: Record<InsightSeverity, string> = {
  critical: "border-destructive/30 bg-destructive/5",
  warning: "border-warning/30 bg-warning/5",
  positive: "border-success/30 bg-success/5",
  info: "border-border bg-secondary/30",
};

const severityIconMap: Record<InsightSeverity, typeof AlertTriangle> = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  positive: TrendingUp,
  info: Lightbulb,
};

const severityIconColor: Record<InsightSeverity, string> = {
  critical: "text-destructive",
  warning: "text-warning",
  positive: "text-success",
  info: "text-primary",
};

const categoryIcon: Record<string, typeof Euro> = {
  revenue: Euro,
  labour: Users,
  food_cost: UtensilsCrossed,
  menu: Target,
  customers: CalendarDays,
  inventory: Package,
  locations: MapPin,
};

function AutoInsightCard({ insight }: { insight: OwnerInsight }) {
  const Icon = severityIconMap[insight.severity];
  const CatIcon = categoryIcon[insight.category] || BarChart3;
  
  return (
    <Card className={cn("border transition-colors", severityStyles[insight.severity])}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-1.5 rounded-md bg-background border border-border shrink-0">
            <CatIcon className={cn("h-4 w-4", severityIconColor[insight.severity])} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-sm font-medium">{insight.title}</h4>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">
                {insight.confidence} confidence
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{insight.description}</p>
            {insight.metric && (
              <div className="flex items-center gap-3 mt-2 p-2 rounded bg-background/60 border border-border">
                <div>
                  <span className="text-lg font-bold">{insight.metric.value}</span>
                  <span className="text-xs text-muted-foreground ml-1.5">{insight.metric.label}</span>
                </div>
                {insight.metric.change && (
                  <span className="text-xs text-muted-foreground">{insight.metric.change}</span>
                )}
              </div>
            )}
            {insight.action && (
              <div className="flex items-start gap-1.5 mt-2 text-sm text-primary">
                <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{insight.action}</span>
              </div>
            )}
            {insight.missingData && insight.missingData.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Reduced confidence — missing: {insight.missingData.join(", ")}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AIInsightsPage() {
  const { selectedLocationId } = useLocation();
  const { data: intelligence, isLoading: intelligenceLoading } = useOwnerIntelligence(selectedLocationId);
  const {
    stockForecast,
    stockForecastLoading,
    stockForecastUpdated,
    generateStockForecast,
    
    menuInsights,
    menuInsightsLoading,
    menuInsightsUpdated,
    generateMenuInsights,
    
    costAnalysis,
    costAnalysisLoading,
    costAnalysisUpdated,
    generateCostAnalysis,
    
    staffForecast,
    staffForecastLoading,
    staffForecastUpdated,
    generateStaffForecast,
    
    purchaseSuggestions,
    purchaseSuggestionsLoading,
    purchaseSuggestionsUpdated,
    generatePurchaseSuggestions,
  } = useAIInsights();

  const handleRefreshAll = () => {
    generateStockForecast();
    generateMenuInsights();
    generateCostAnalysis();
    generateStaffForecast();
    generatePurchaseSuggestions();
  };

  const autoInsights = intelligence?.insights || [];
  const weeklySummary = intelligence?.weeklySummary;

  // Group auto insights by category
  const alertInsights = autoInsights.filter(i => i.type === "alert" || i.severity === "critical" || i.severity === "warning");
  const trendInsights = autoInsights.filter(i => i.type === "trend");
  const opportunityInsights = autoInsights.filter(i => i.type === "opportunity" || i.severity === "positive");
  const comparisonInsights = autoInsights.filter(i => i.type === "comparison");

  return (
    <RequirePermission resource="ai_features" action="view">
      <PageLayout
        title="AI Insights Dashboard"
        description="Actionable recommendations across your restaurant operations"
        action={
          <Button onClick={handleRefreshAll} className="gap-2">
            <Zap className="h-4 w-4" />
            Generate All Insights
          </Button>
        }
      >
        <div className="space-y-8">
          {/* Auto-Generated Intelligence */}
          {(autoInsights.length > 0 || weeklySummary) && (
            <>
              {/* Weekly Summary */}
              {weeklySummary && (
                <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      <h2 className="text-lg font-semibold">Weekly Performance Summary</h2>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-auto">
                        {weeklySummary.confidence} confidence
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">{weeklySummary.narrative}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="rounded-md border border-border p-3 text-center bg-background/60">
                        <p className={cn("text-xl font-bold", weeklySummary.revenueChange >= 0 ? "text-success" : "text-destructive")}>
                          {weeklySummary.revenueChange >= 0 ? "+" : ""}{weeklySummary.revenueChange.toFixed(1)}%
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">Revenue Change</p>
                        <p className="text-[10px] text-muted-foreground">{formatCurrency(weeklySummary.thisWeek.revenue)} this week</p>
                      </div>
                      <div className="rounded-md border border-border p-3 text-center bg-background/60">
                        <p className={cn("text-xl font-bold", weeklySummary.ordersChange >= 0 ? "text-success" : "text-destructive")}>
                          {weeklySummary.ordersChange >= 0 ? "+" : ""}{weeklySummary.ordersChange.toFixed(1)}%
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">Order Volume</p>
                        <p className="text-[10px] text-muted-foreground">{weeklySummary.thisWeek.orders} this week</p>
                      </div>
                      {weeklySummary.labourPctThis !== null && (
                        <div className="rounded-md border border-border p-3 text-center bg-background/60">
                          <p className={cn("text-xl font-bold", weeklySummary.labourPctThis > 35 ? "text-warning" : "text-foreground")}>
                            {weeklySummary.labourPctThis.toFixed(1)}%
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">Labour %</p>
                          {weeklySummary.labourPctLast !== null && (
                            <p className="text-[10px] text-muted-foreground">
                              {(weeklySummary.labourPctThis - weeklySummary.labourPctLast) >= 0 ? "+" : ""}
                              {(weeklySummary.labourPctThis - weeklySummary.labourPctLast).toFixed(1)}pp vs last week
                            </p>
                          )}
                        </div>
                      )}
                      {weeklySummary.foodCostPctThis !== null && (
                        <div className="rounded-md border border-border p-3 text-center bg-background/60">
                          <p className={cn("text-xl font-bold", weeklySummary.foodCostPctThis > 35 ? "text-warning" : "text-foreground")}>
                            {weeklySummary.foodCostPctThis.toFixed(1)}%
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">Food Cost %</p>
                          {weeklySummary.foodCostPctLast !== null && (
                            <p className="text-[10px] text-muted-foreground">
                              {(weeklySummary.foodCostPctThis - weeklySummary.foodCostPctLast) >= 0 ? "+" : ""}
                              {(weeklySummary.foodCostPctThis - weeklySummary.foodCostPctLast).toFixed(1)}pp vs last week
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    {weeklySummary.missingData.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        Missing data: {weeklySummary.missingData.join(", ")} — some metrics may be estimated.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Performance Alerts */}
              {alertInsights.length > 0 && (
                <AIInsightSection title="Performance Alerts" description="Issues requiring attention" columns={2}>
                  {alertInsights.map(insight => (
                    <AutoInsightCard key={insight.id} insight={insight} />
                  ))}
                </AIInsightSection>
              )}

              {/* Trends & Patterns */}
              {trendInsights.length > 0 && (
                <AIInsightSection title="Trends & Patterns" description="Detected from your operational data" columns={2}>
                  {trendInsights.map(insight => (
                    <AutoInsightCard key={insight.id} insight={insight} />
                  ))}
                </AIInsightSection>
              )}

              {/* Opportunities */}
              {opportunityInsights.length > 0 && (
                <AIInsightSection title="Opportunities" description="Areas to grow or optimise" columns={2}>
                  {opportunityInsights.map(insight => (
                    <AutoInsightCard key={insight.id} insight={insight} />
                  ))}
                </AIInsightSection>
              )}

              {/* Location Comparison */}
              {comparisonInsights.length > 0 && (
                <AIInsightSection title="Location Comparison" description="Cross-location performance analysis" columns={2}>
                  {comparisonInsights.map(insight => (
                    <AutoInsightCard key={insight.id} insight={insight} />
                  ))}
                </AIInsightSection>
              )}
            </>
          )}

          {/* Inventory Intelligence */}
          <AIInsightSection 
            title="Inventory Intelligence" 
            description="Stock predictions and purchasing recommendations"
            columns={2}
          >
            <div className="space-y-0">
              <AIInsightCard
                title="Low Stock Risk"
                description="Ingredients at risk of running out based on usage trends"
                icon={Package}
                type={stockForecast?.alerts?.length ? "warning" : "info"}
                items={stockForecast?.alerts?.map((a: any) => `${a.ingredient}: ${a.message}`) || stockForecast?.insights}
                isLoading={stockForecastLoading}
                error={stockForecast?.error}
                lastUpdated={stockForecastUpdated}
                onRefresh={generateStockForecast}
                confidence="high"
                whyItMatters="Running out of key ingredients causes 86'd menu items and lost sales. Early alerts let you reorder before service is impacted."
                emptyReason="Requires stock levels and recent sales data. Add inventory counts and record sales to activate this insight."
              />
              <InsightCTA to="/inventory/forecast" label="Open Inventory Forecast" />
            </div>
            <div className="space-y-0">
              <AIInsightCard
                title="Smart Purchase Suggestions"
                description="Optimised ordering based on consumption patterns"
                icon={ShoppingCart}
                type="info"
                items={purchaseSuggestions?.recommendations || purchaseSuggestions?.items}
                isLoading={purchaseSuggestionsLoading}
                error={purchaseSuggestions?.error}
                lastUpdated={purchaseSuggestionsUpdated}
                onRefresh={generatePurchaseSuggestions}
                confidence="medium"
                whyItMatters="Right-sized orders reduce food waste and free up cash that would otherwise be tied up in excess inventory."
                emptyReason="Requires ingredient data and purchase history. Add ingredients and create purchase orders to enable suggestions."
              />
              <InsightCTA to="/purchase-orders" label="View Purchase Orders" />
            </div>
          </AIInsightSection>

          {/* Menu & Profitability */}
          <AIInsightSection 
            title="Menu & Profitability" 
            description="Pricing opportunities and margin analysis"
            columns={3}
          >
            <div className="space-y-0">
              <AIInsightCard
                title="Menu Items to Reprice"
                description="Dishes where a price adjustment could improve margins"
                icon={Euro}
                type="warning"
                items={Array.isArray(menuInsights?.insights) ? menuInsights.insights.filter((i: string) => i.toLowerCase().includes('price') || i.toLowerCase().includes('margin')) : undefined}
                isLoading={menuInsightsLoading}
                error={menuInsights?.error}
                lastUpdated={menuInsightsUpdated}
                onRefresh={generateMenuInsights}
                confidence="medium"
                whyItMatters="Underpriced popular items silently erode margins. Small adjustments on high-volume dishes significantly boost profitability."
                emptyReason="Requires dishes with ingredient costs and recent sales. Add dish recipes and record sales to see repricing opportunities."
              />
              <InsightCTA to="/ai/menu-engineering" label="Open Menu Engineering" />
            </div>
            <div className="space-y-0">
              <AIInsightCard
                title="Top Margin Winners"
                description="Your most profitable dishes to promote"
                icon={Target}
                type="success"
                items={Array.isArray(costAnalysis?.recommendations) ? costAnalysis.recommendations.filter((r: string) => r.toLowerCase().includes('profit') || r.toLowerCase().includes('winner') || r.toLowerCase().includes('margin')) : undefined}
                isLoading={costAnalysisLoading}
                error={costAnalysis?.error}
                lastUpdated={costAnalysisUpdated}
                onRefresh={generateCostAnalysis}
                confidence="high"
                whyItMatters="Knowing your profit leaders lets you promote them strategically and train staff to upsell high-margin items."
                emptyReason="Requires dishes with ingredient costs and sales history. Complete your menu setup to identify margin winners."
              />
              <InsightCTA to="/cost-analysis" label="View Cost Analysis" />
            </div>
            <div className="space-y-0">
              <AIInsightCard
                title="Profit Leak Detection"
                description="Areas where costs are higher than expected"
                icon={AlertTriangle}
                type="error"
                items={Array.isArray(costAnalysis?.insights) ? costAnalysis.insights.filter((i: string) => i.toLowerCase().includes('cost') || i.toLowerCase().includes('loss') || i.toLowerCase().includes('high')) : undefined}
                isLoading={costAnalysisLoading}
                error={costAnalysis?.error}
                lastUpdated={costAnalysisUpdated}
                onRefresh={generateCostAnalysis}
                confidence="high"
                whyItMatters="Undetected profit leaks—portion creep, waste, or mispricing—can drain thousands monthly. Early detection saves money."
                emptyReason="Requires detailed cost data and sales records. Add ingredient costs and track expenses to detect leaks."
              />
              <InsightCTA to="/cost-analysis" label="View Cost Analysis" />
            </div>
          </AIInsightSection>

          {/* Staffing & Operations */}
          <AIInsightSection 
            title="Staffing & Operations" 
            description="Labour optimisation and waste reduction"
            columns={2}
          >
            <div className="space-y-0">
              <AIInsightCard
                title="Staffing Recommendation"
                description="Adjust labour to match predicted demand"
                icon={Users}
                type="info"
                items={staffForecast?.recommendations}
                isLoading={staffForecastLoading}
                error={staffForecast?.error}
                lastUpdated={staffForecastUpdated}
                onRefresh={generateStaffForecast}
                confidence="medium"
                whyItMatters="Right-sizing staff to demand cuts labour costs without hurting service quality—labour is typically 25–35% of revenue."
                emptyReason="Requires staff records with hourly rates and recent sales data. Add staff and record sales to see recommendations."
              />
              <InsightCTA to="/ai/scheduling" label="Open Staff Scheduling" />
            </div>
            <div className="space-y-0">
              <AIInsightCard
                title="High Waste Risk Ingredients"
                description="Items with unusual consumption patterns"
                icon={AlertTriangle}
                type="warning"
                items={stockForecast?.forecasts?.filter((f: any) => f.anomaly)?.map((f: any) => `${f.ingredient}: Unusual consumption detected`)}
                isLoading={stockForecastLoading}
                error={stockForecast?.error}
                lastUpdated={stockForecastUpdated}
                onRefresh={generateStockForecast}
                confidence="low"
                whyItMatters="Reducing food waste directly improves your bottom line and helps meet sustainability goals valued by customers."
                emptyReason="Requires stock tracking over time. Record regular stock counts to detect consumption anomalies."
              />
              <InsightCTA to="/stock" label="View Stock Levels" />
            </div>
          </AIInsightSection>
        </div>
      </PageLayout>
    </RequirePermission>
  );
}
