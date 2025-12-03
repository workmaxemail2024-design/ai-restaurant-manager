import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Sparkles, TrendingUp, AlertCircle, Lightbulb, RefreshCw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAIInsights } from "@/hooks/useAIInsights";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Insight {
  type: "trend" | "alert" | "suggestion";
  title: string;
  description: string;
}

const iconMap = {
  trend: TrendingUp,
  alert: AlertCircle,
  suggestion: Lightbulb,
};

const colorMap = {
  trend: "text-primary",
  alert: "text-warning",
  suggestion: "text-success",
};

export function AIInsightPanel() {
  const { 
    dailySummary, 
    dailySummaryLoading, 
    generateDailySummary,
    stockForecast,
    stockForecastLoading,
    generateStockForecast
  } = useAIInsights();
  
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Generate default insights from AI data
  const insights: Insight[] = [];
  
  if (dailySummary?.recommendations?.length) {
    insights.push({
      type: "suggestion",
      title: "AI Recommendation",
      description: dailySummary.recommendations[0],
    });
  }
  
  if (stockForecast?.alerts?.length) {
    insights.push({
      type: "alert",
      title: "Stock Alert",
      description: stockForecast.alerts[0]?.message || "Low stock detected",
    });
  }
  
  if (dailySummary?.watchItems?.length) {
    insights.push({
      type: "trend",
      title: "Watch Item",
      description: dailySummary.watchItems[0],
    });
  }

  // Add fallback insights if no AI data
  if (insights.length === 0) {
    insights.push(
      {
        type: "trend",
        title: "Peak Hours Shifting",
        description: "Lunch rush is starting 30min earlier this week. Consider adjusting staff schedules.",
      },
      {
        type: "alert",
        title: "Low Stock Alert",
        description: "Some ingredients may run low. Click refresh for AI analysis.",
      },
      {
        type: "suggestion",
        title: "Menu Optimization",
        description: "Generate AI insights to discover margin optimization opportunities.",
      }
    );
  }

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([generateDailySummary(), generateStockForecast()]);
    setIsRefreshing(false);
  };

  const isLoading = dailySummaryLoading || stockForecastLoading;

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden animate-fade-in" style={{ animationDelay: "400ms" }}>
      <div className="p-4 border-b border-border bg-gradient-to-r from-primary/10 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/20">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">AI Insights</h3>
              <p className="text-xs text-muted-foreground">Powered by machine learning</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
          >
            <RefreshCw className={cn("h-4 w-4", (isRefreshing || isLoading) && "animate-spin")} />
          </Button>
        </div>
      </div>
      
      <div className="p-4 space-y-4">
        {isLoading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-4 w-4 mt-0.5 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : (
          insights.slice(0, 3).map((insight, index) => {
            const Icon = iconMap[insight.type];
            return (
              <div 
                key={index} 
                className="p-3 rounded-lg bg-secondary/50 border border-border hover:border-primary/20 transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <Icon className={`h-4 w-4 mt-0.5 ${colorMap[insight.type]}`} />
                  <div>
                    <h4 className="text-sm font-medium">{insight.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{insight.description}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      
      <div className="p-4 border-t border-border">
        <Link to="/ai/insights">
          <Button variant="ghost" className="w-full justify-center text-primary hover:text-primary hover:bg-primary/10">
            <Sparkles className="h-4 w-4 mr-2" />
            View All AI Insights
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
