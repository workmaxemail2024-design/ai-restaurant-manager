import { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, AlertCircle, Sparkles, Clock } from "lucide-react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface AnimatedAICardProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  type?: "info" | "success" | "warning" | "error";
  content?: string;
  items?: string[];
  isLoading?: boolean;
  error?: string;
  lastUpdated?: Date | null;
  onRefresh?: () => void;
  className?: string;
  children?: ReactNode;
}

const typeStyles = {
  info: {
    border: "border-primary/20",
    bg: "bg-primary/5",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    glow: "shadow-primary/10",
  },
  success: {
    border: "border-green-500/20",
    bg: "bg-green-500/5",
    iconBg: "bg-green-500/10",
    iconColor: "text-green-500",
    glow: "shadow-green-500/10",
  },
  warning: {
    border: "border-yellow-500/20",
    bg: "bg-yellow-500/5",
    iconBg: "bg-yellow-500/10",
    iconColor: "text-yellow-500",
    glow: "shadow-yellow-500/10",
  },
  error: {
    border: "border-destructive/20",
    bg: "bg-destructive/5",
    iconBg: "bg-destructive/10",
    iconColor: "text-destructive",
    glow: "shadow-destructive/10",
  },
};

export function AnimatedAICard({
  title,
  description,
  icon: Icon = Sparkles,
  type = "info",
  content,
  items,
  isLoading,
  error,
  lastUpdated,
  onRefresh,
  className,
  children,
}: AnimatedAICardProps) {
  const styles = typeStyles[type];

  if (isLoading) {
    return (
      <Card className={cn(
        "relative overflow-hidden border transition-all duration-500",
        styles.border,
        styles.bg,
        className
      )}>
        {/* Shimmer effect */}
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(
      "relative overflow-hidden border transition-all duration-300 hover:shadow-lg",
      styles.border,
      styles.bg,
      `hover:${styles.glow}`,
      "animate-fade-in",
      className
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2.5 rounded-lg transition-transform hover:scale-105",
              styles.iconBg
            )}>
              <Icon className={cn("h-5 w-5", styles.iconColor)} />
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
              className="h-8 w-8 hover:bg-background/50"
              onClick={onRefresh}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error ? (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : children ? (
          children
        ) : content ? (
          <p className="text-sm text-muted-foreground leading-relaxed">{content}</p>
        ) : items && items.length > 0 ? (
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li 
                key={index} 
                className="flex items-start gap-2 text-sm text-muted-foreground animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <span className={cn("mt-1.5 h-1.5 w-1.5 rounded-full shrink-0", styles.iconBg.replace('/10', ''))} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No insights available yet. Ensure sales and labour data exist for this period.
          </p>
        )}
        
        {lastUpdated && (
          <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border/50">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
