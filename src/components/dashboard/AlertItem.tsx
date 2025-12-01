import { cn } from "@/lib/utils";
import { AlertTriangle, Info, CheckCircle, XCircle, LucideIcon } from "lucide-react";

type AlertType = "warning" | "info" | "success" | "error";

interface AlertItemProps {
  type: AlertType;
  title: string;
  description: string;
  time: string;
  delay?: number;
}

const alertConfig: Record<AlertType, { icon: LucideIcon; className: string }> = {
  warning: { 
    icon: AlertTriangle, 
    className: "text-warning bg-warning/10 border-warning/20" 
  },
  info: { 
    icon: Info, 
    className: "text-primary bg-primary/10 border-primary/20" 
  },
  success: { 
    icon: CheckCircle, 
    className: "text-success bg-success/10 border-success/20" 
  },
  error: { 
    icon: XCircle, 
    className: "text-destructive bg-destructive/10 border-destructive/20" 
  },
};

export function AlertItem({ type, title, description, time, delay = 0 }: AlertItemProps) {
  const { icon: Icon, className } = alertConfig[type];

  return (
    <div 
      className="flex items-start gap-3 p-4 rounded-lg bg-secondary/50 border border-border transition-all duration-200 hover:bg-secondary animate-slide-in-right"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={cn("p-2 rounded-lg border", className)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-medium text-sm truncate">{title}</h4>
          <span className="text-xs text-muted-foreground whitespace-nowrap">{time}</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
    </div>
  );
}
