import { useEffect } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { RequirePermission } from "@/components/RequirePermission";
import { AIInsightCard } from "@/components/ai/AIInsightCard";
import { AIInsightSection } from "@/components/ai/AIInsightSection";
import { useAIInsights } from "@/hooks/useAIInsights";
import { Button } from "@/components/ui/button";
import { 
  Sparkles, 
  TrendingUp, 
  Package, 
  DollarSign, 
  AlertTriangle,
  Users,
  ShoppingCart,
  Target,
  Zap
} from "lucide-react";

export default function AIInsightsPage() {
  const {
    dailySummary,
    dailySummaryLoading,
    dailySummaryUpdated,
    generateDailySummary,
    
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
    generateDailySummary();
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
        description="AI-powered intelligence for your restaurant operations"
        action={
          <Button onClick={handleRefreshAll} className="gap-2">
            <Zap className="h-4 w-4" />
            Refresh All Insights
          </Button>
        }
      >
        <div className="space-y-8">
          {/* Daily Operations */}
          <AIInsightSection 
            title="Daily Operations" 
            description="Overview of yesterday's performance and today's priorities"
            columns={2}
          >
            <AIInsightCard
              title="AI Daily Summary"
              description="Comprehensive analysis of operations"
              icon={Sparkles}
              type="info"
              content={dailySummary?.summary}
              items={dailySummary?.recommendations}
              isLoading={dailySummaryLoading}
              error={dailySummary?.error}
              lastUpdated={dailySummaryUpdated}
              onRefresh={generateDailySummary}
            />
            <AIInsightCard
              title="Tomorrow's Sales Forecast"
              description="Predicted revenue and busy periods"
              icon={TrendingUp}
              type="success"
              items={staffForecast?.insights || staffForecast?.items}
              isLoading={staffForecastLoading}
              error={staffForecast?.error}
              lastUpdated={staffForecastUpdated}
              onRefresh={generateStaffForecast}
            />
          </AIInsightSection>

          {/* Inventory Intelligence */}
          <AIInsightSection 
            title="Inventory Intelligence" 
            description="Stock predictions and purchasing recommendations"
            columns={2}
          >
            <AIInsightCard
              title="Predicted Stock Shortages"
              description="Items at risk of running out"
              icon={Package}
              type={stockForecast?.alerts?.length ? "warning" : "info"}
              items={stockForecast?.alerts?.map((a: any) => `${a.ingredient}: ${a.message}`) || stockForecast?.insights}
              isLoading={stockForecastLoading}
              error={stockForecast?.error}
              lastUpdated={stockForecastUpdated}
              onRefresh={generateStockForecast}
            />
            <AIInsightCard
              title="AI Purchase Suggestions"
              description="Smart ordering recommendations"
              icon={ShoppingCart}
              type="info"
              items={purchaseSuggestions?.recommendations || purchaseSuggestions?.items}
              isLoading={purchaseSuggestionsLoading}
              error={purchaseSuggestions?.error}
              lastUpdated={purchaseSuggestionsUpdated}
              onRefresh={generatePurchaseSuggestions}
            />
          </AIInsightSection>

          {/* Menu & Profitability */}
          <AIInsightSection 
            title="Menu & Profitability" 
            description="Menu optimization and profit analysis"
            columns={3}
          >
            <AIInsightCard
              title="Menu Items to Reprice"
              description="Pricing optimization opportunities"
              icon={DollarSign}
              type="warning"
              items={Array.isArray(menuInsights?.insights) ? menuInsights.insights.filter((i: string) => i.toLowerCase().includes('price') || i.toLowerCase().includes('margin')) : undefined}
              isLoading={menuInsightsLoading}
              error={menuInsights?.error}
              lastUpdated={menuInsightsUpdated}
              onRefresh={generateMenuInsights}
            />
            <AIInsightCard
              title="Top Margin Winners"
              description="Your most profitable dishes"
              icon={Target}
              type="success"
              items={Array.isArray(costAnalysis?.recommendations) ? costAnalysis.recommendations.filter((r: string) => r.toLowerCase().includes('profit') || r.toLowerCase().includes('winner') || r.toLowerCase().includes('margin')) : undefined}
              isLoading={costAnalysisLoading}
              error={costAnalysis?.error}
              lastUpdated={costAnalysisUpdated}
              onRefresh={generateCostAnalysis}
            />
            <AIInsightCard
              title="Profit Leak Detection"
              description="Areas where you're losing money"
              icon={AlertTriangle}
              type="error"
              items={Array.isArray(costAnalysis?.insights) ? costAnalysis.insights.filter((i: string) => i.toLowerCase().includes('cost') || i.toLowerCase().includes('loss') || i.toLowerCase().includes('high')) : undefined}
              isLoading={costAnalysisLoading}
              error={costAnalysis?.error}
              lastUpdated={costAnalysisUpdated}
              onRefresh={generateCostAnalysis}
            />
          </AIInsightSection>

          {/* Staffing & Waste */}
          <AIInsightSection 
            title="Staffing & Operations" 
            description="Staff scheduling and waste reduction insights"
            columns={2}
          >
            <AIInsightCard
              title="Staffing Recommendations"
              description="Optimal staff scheduling"
              icon={Users}
              type="info"
              items={staffForecast?.recommendations}
              isLoading={staffForecastLoading}
              error={staffForecast?.error}
              lastUpdated={staffForecastUpdated}
              onRefresh={generateStaffForecast}
            />
            <AIInsightCard
              title="High Waste Risk Ingredients"
              description="Items at risk of expiring or being wasted"
              icon={AlertTriangle}
              type="warning"
              items={stockForecast?.forecasts?.filter((f: any) => f.anomaly)?.map((f: any) => `${f.ingredient}: Unusual consumption detected`)}
              isLoading={stockForecastLoading}
              error={stockForecast?.error}
              lastUpdated={stockForecastUpdated}
              onRefresh={generateStockForecast}
            />
          </AIInsightSection>
        </div>
      </PageLayout>
    </RequirePermission>
  );
}
