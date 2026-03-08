import { PageLayout } from "@/components/common/PageLayout";
import { RequirePermission } from "@/components/RequirePermission";
import { AIInsightCard } from "@/components/ai/AIInsightCard";
import { AIInsightSection } from "@/components/ai/AIInsightSection";
import { useAIInsights } from "@/hooks/useAIInsights";
import { Button } from "@/components/ui/button";
import { 
  Package, 
  Euro, 
  AlertTriangle,
  Users,
  ShoppingCart,
  Target,
  Zap,
  ArrowRight,
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

export default function AIInsightsPage() {
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

  return (
    <RequirePermission resource="ai_features" action="view">
      <PageLayout
        title="AI Insights Dashboard"
        description="Actionable recommendations across your restaurant operations"
        action={
          <Button onClick={handleRefreshAll} className="gap-2">
            <Zap className="h-4 w-4" />
            Refresh All
          </Button>
        }
      >
        <div className="space-y-8">
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
