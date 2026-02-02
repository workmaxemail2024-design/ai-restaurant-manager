import { useNavigate } from "react-router-dom";
import { Package, Truck, Users, AlertTriangle, ChevronRight } from "lucide-react";
import { useDashboardActions } from "@/hooks/useDashboardActions";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ActionRequiredPanelProps {
  locationId?: string | null;
}

export function ActionRequiredPanel({ locationId }: ActionRequiredPanelProps) {
  const navigate = useNavigate();
  const { data: actions, isLoading } = useDashboardActions(locationId);

  const lowStockCount = actions?.lowStock.length || 0;
  const pendingPOCount = actions?.pendingPOs.length || 0;
  const staffIssuesCount = actions?.staffHoursIssues.length || 0;
  const totalActions = lowStockCount + pendingPOCount + staffIssuesCount;

  if (isLoading) {
    return (
      <div className="rounded-xl bg-card border border-border p-4 animate-pulse">
        <div className="h-5 bg-muted rounded w-1/3 mb-4" />
        <div className="space-y-2">
          <div className="h-10 bg-muted rounded" />
          <div className="h-10 bg-muted rounded" />
          <div className="h-10 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (totalActions === 0) {
    return (
      <div className="rounded-xl bg-card border border-border p-4 animate-fade-in">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Action Required</h3>
        </div>
        <p className="text-sm text-muted-foreground">No actions required at this time.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card border border-border p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <h3 className="font-semibold text-sm">Action Required</h3>
        </div>
        <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10">
          {totalActions} items
        </Badge>
      </div>

      <div className="space-y-2">
        {/* Low Stock */}
        {lowStockCount > 0 && (
          <ActionItem
            icon={Package}
            label="Low stock ingredients"
            count={lowStockCount}
            variant="warning"
            onClick={() => navigate("/stock")}
            details={actions?.lowStock.slice(0, 2).map(s => s.ingredientName).join(", ")}
          />
        )}

        {/* Pending POs */}
        {pendingPOCount > 0 && (
          <ActionItem
            icon={Truck}
            label="POs pending receipt"
            count={pendingPOCount}
            variant="info"
            onClick={() => navigate("/purchase-orders")}
            details={actions?.pendingPOs.slice(0, 2).map(p => p.supplierName).join(", ")}
          />
        )}

        {/* Staff Hours Issues */}
        {staffIssuesCount > 0 && (
          <ActionItem
            icon={Users}
            label="Staff hours issues"
            count={staffIssuesCount}
            variant={actions?.staffHoursIssues.some(s => s.type === "over") ? "error" : "warning"}
            onClick={() => navigate("/staff/shifts")}
            details={actions?.staffHoursIssues.slice(0, 2).map(s => 
              `${s.staffName.split(" ")[0]} (${s.type === "over" ? "+" : "-"}${Math.abs(s.scheduledHours - s.contractedHours)}h)`
            ).join(", ")}
          />
        )}
      </div>
    </div>
  );
}

interface ActionItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  variant: "warning" | "error" | "info";
  onClick: () => void;
  details?: string;
}

function ActionItem({ icon: Icon, label, count, variant, onClick, details }: ActionItemProps) {
  const variantStyles = {
    warning: "bg-warning/10 border-warning/20 text-warning",
    error: "bg-destructive/10 border-destructive/20 text-destructive",
    info: "bg-primary/10 border-primary/20 text-primary",
  };

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-secondary/50 border border-border hover:bg-secondary transition-colors text-left group"
    >
      <div className={cn("p-1.5 rounded-md border", variantStyles[variant])}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
            {count}
          </Badge>
        </div>
        {details && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{details}</p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
    </button>
  );
}
