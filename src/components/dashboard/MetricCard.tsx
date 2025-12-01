import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  delay?: number;
}

export function MetricCard({ 
  title, 
  value, 
  change, 
  changeType = "neutral", 
  icon: Icon,
  delay = 0 
}: MetricCardProps) {
  return (
    <div 
      className="group relative overflow-hidden rounded-xl bg-card border border-border p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Subtle glow effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
          <div className="p-2 rounded-lg bg-secondary">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
        
        <div className="space-y-1">
          <p className="text-3xl font-semibold tracking-tight">{value}</p>
          {change && (
            <p className={cn(
              "text-sm font-medium",
              changeType === "positive" && "text-success",
              changeType === "negative" && "text-destructive",
              changeType === "neutral" && "text-muted-foreground"
            )}>
              {change}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
