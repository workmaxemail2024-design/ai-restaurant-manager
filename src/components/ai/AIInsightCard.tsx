import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AICardSkeleton } from "./AISkeleton";
import { RefreshCw, Clock, AlertTriangle, CheckCircle, Info, Sparkles, Lightbulb } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export type InsightType = "success" | "warning" | "error" | "info";
export type ConfidenceLevel = "low" | "medium" | "high";

export interface AIInsightCardProps {
  title: string;
  description?: string;
  icon: React.ElementType;
  type?: InsightType;
  content?: string | null;
  items?: string[];
  isLoading?: boolean;
  error?: string | null;
  lastUpdated?: Date | null;
  onRefresh?: () => void;
  className?: string;
  confidence?: ConfidenceLevel;
  whyItMatters?: string;
}

const confidenceStyles: Record<ConfidenceLevel, { label: string; className: string }> = {
  low: { label: "Low Confidence", className: "bg-muted text-muted-foreground border-muted" },
  medium: { label: "Medium Confidence", className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20" },
  high: { label: "High Confidence", className: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20" },
};

const typeStyles: Record<InsightType, { badge: string; border: string; glow: string }> = {
  success: { 
    badge: "bg-green-500/10 text-green-500 border-green-500/20", 
    border: "border-green-500/20 hover:border-green-500/40", 
    glow: "hover:shadow-green-500/10" 
  },
  warning: { 
    badge: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", 
    border: "border-yellow-500/20 hover:border-yellow-500/40", 
    glow: "hover:shadow-yellow-500/10" 
  },
  error: { 
    badge: "bg-red-500/10 text-red-500 border-red-500/20", 
    border: "border-red-500/20 hover:border-red-500/40", 
    glow: "hover:shadow-red-500/10" 
  },
  info: { 
    badge: "bg-primary/10 text-primary border-primary/20", 
    border: "border-primary/20 hover:border-primary/40", 
    glow: "hover:shadow-primary/10" 
  },
};

export function AIInsightCard({
  title,
  description,
  icon: Icon,
  type = "info",
  content,
  items,
  isLoading,
  error,
  lastUpdated,
  onRefresh,
  className,
  confidence,
  whyItMatters,
}: AIInsightCardProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const style = typeStyles[type];

  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      await onRefresh();
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return <AICardSkeleton />;
  }

  return (
    <Card className={cn(
      "overflow-hidden transition-all duration-300 hover:shadow-lg animate-fade-in",
      style.border,
      style.glow,
      className
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2.5 rounded-lg transition-transform hover:scale-105",
              style.badge
            )}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-base font-semibold">{title}</CardTitle>
                {confidence && (
                  <Badge 
                    variant="outline" 
                    className={cn("text-[10px] px-1.5 py-0 h-5", confidenceStyles[confidence].className)}
                  >
                    {confidenceStyles[confidence].label}
                  </Badge>
                )}
              </div>
              {description && (
                <CardDescription className="text-xs">{description}</CardDescription>
              )}
            </div>
          </div>
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-background/50 shrink-0"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Why It Matters section */}
        {whyItMatters && !error && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/50 border border-border/50">
            <Lightbulb className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-foreground">Why this matters</p>
              <p className="text-xs text-muted-foreground mt-0.5">{whyItMatters}</p>
            </div>
          </div>
        )}

        {error ? (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : content ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{content}</p>
          </div>
        ) : items && items.length > 0 ? (
          <ul className="space-y-2">
            {items.map((item, i) => (
              <li 
                key={i} 
                className="flex items-start gap-2 text-sm animate-fade-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <Sparkles className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Click refresh to generate insights
          </p>
        )}
        
        {lastUpdated && (
          <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-border/50">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Updated {format(lastUpdated, "MMM d, h:mm a")}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
