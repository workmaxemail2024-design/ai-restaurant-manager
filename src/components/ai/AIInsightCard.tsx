import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AICardSkeleton } from "./AISkeleton";
import { RefreshCw, Clock, AlertTriangle, CheckCircle, Info, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export type InsightType = "success" | "warning" | "error" | "info";

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
}

const typeStyles: Record<InsightType, { badge: string; border: string; icon: React.ElementType }> = {
  success: { badge: "bg-green-500/10 text-green-500 border-green-500/20", border: "border-green-500/20", icon: CheckCircle },
  warning: { badge: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", border: "border-yellow-500/20", icon: AlertTriangle },
  error: { badge: "bg-red-500/10 text-red-500 border-red-500/20", border: "border-red-500/20", icon: AlertTriangle },
  info: { badge: "bg-blue-500/10 text-blue-500 border-blue-500/20", border: "border-blue-500/20", icon: Info },
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
    <Card className={cn("overflow-hidden transition-all duration-300 hover:shadow-lg", style.border, className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("p-2.5 rounded-lg", style.badge)}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">{title}</CardTitle>
              {description && (
                <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
              )}
            </div>
          </div>
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
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
              <li key={i} className="flex items-start gap-2 text-sm">
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
          <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-border">
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
