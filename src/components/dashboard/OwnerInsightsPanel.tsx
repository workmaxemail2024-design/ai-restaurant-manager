import { Link } from "react-router-dom";
import { useOwnerIntelligence, type OwnerInsight, type InsightSeverity } from "@/hooks/useOwnerIntelligence";
import { useLocation } from "@/contexts/LocationContext";
import { Sparkles, TrendingUp, TrendingDown, AlertTriangle, Lightbulb, ArrowRight, GitCompare, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

const severityStyles: Record<InsightSeverity, string> = {
  critical: "border-destructive/30 bg-destructive/5",
  warning: "border-warning/30 bg-warning/5",
  positive: "border-success/30 bg-success/5",
  info: "border-border bg-secondary/30",
};

const severityIcon: Record<InsightSeverity, typeof AlertTriangle> = {
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

export function OwnerInsightsPanel() {
  const { selectedLocationId } = useLocation();
  const { data, isLoading } = useOwnerIntelligence(selectedLocationId);

  const insights = data?.insights || [];
  const summary = data?.weeklySummary;
  const topInsights = insights.slice(0, 4);

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden animate-fade-in" style={{ animationDelay: "300ms" }}>
      {/* Header */}
      <div className="p-4 border-b border-border bg-gradient-to-r from-primary/10 to-transparent">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/20">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Owner Intelligence</h3>
            <p className="text-[11px] text-muted-foreground">Auto-analysed from your data</p>
          </div>
        </div>
      </div>

      {/* Weekly Summary */}
      {isLoading ? (
        <div className="p-4 space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {summary && (
            <div className="p-3 rounded-lg bg-secondary/50 border border-border">
              <div className="flex items-center gap-1.5 mb-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium">Weekly Performance</span>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 ml-auto">
                  {summary.confidence} confidence
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{summary.narrative}</p>
              <div className="flex items-center gap-3 mt-2">
                <div className="text-center">
                  <p className={cn("text-sm font-semibold", summary.revenueChange >= 0 ? "text-success" : "text-destructive")}>
                    {summary.revenueChange >= 0 ? "+" : ""}{summary.revenueChange.toFixed(0)}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">Revenue</p>
                </div>
                <div className="text-center">
                  <p className={cn("text-sm font-semibold", summary.ordersChange >= 0 ? "text-success" : "text-destructive")}>
                    {summary.ordersChange >= 0 ? "+" : ""}{summary.ordersChange.toFixed(0)}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">Orders</p>
                </div>
                {summary.labourPctThis !== null && (
                  <div className="text-center">
                    <p className="text-sm font-semibold">{summary.labourPctThis.toFixed(1)}%</p>
                    <p className="text-[10px] text-muted-foreground">Labour</p>
                  </div>
                )}
                {summary.foodCostPctThis !== null && (
                  <div className="text-center">
                    <p className="text-sm font-semibold">{summary.foodCostPctThis.toFixed(1)}%</p>
                    <p className="text-[10px] text-muted-foreground">Food Cost</p>
                  </div>
                )}
              </div>
              {summary.missingData.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                  <Shield className="h-2.5 w-2.5" />
                  Missing: {summary.missingData.join(", ")}
                </p>
              )}
            </div>
          )}

          {/* Top Insights */}
          {topInsights.map((insight) => {
            const Icon = severityIcon[insight.severity];
            return (
              <div key={insight.id} className={cn("p-3 rounded-lg border transition-colors", severityStyles[insight.severity])}>
                <div className="flex items-start gap-2.5">
                  <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", severityIconColor[insight.severity])} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-medium truncate">{insight.title}</h4>
                      {insight.confidence !== "high" && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0">
                          {insight.confidence}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{insight.description}</p>
                    {insight.action && (
                      <p className="text-[11px] text-primary mt-1 line-clamp-1">→ {insight.action}</p>
                    )}
                    {insight.missingData && insight.missingData.length > 0 && (
                      <p className="text-[9px] text-muted-foreground mt-1 flex items-center gap-0.5">
                        <Shield className="h-2 w-2" /> Reduced confidence: {insight.missingData.join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {insights.length === 0 && !summary && (
            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground">
                Not enough data yet. Add sales and labour records to generate insights.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="p-3 border-t border-border">
        <Link to="/ai/insights">
          <Button variant="ghost" size="sm" className="w-full justify-center text-xs text-primary hover:text-primary hover:bg-primary/10 h-7">
            View All Insights
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
