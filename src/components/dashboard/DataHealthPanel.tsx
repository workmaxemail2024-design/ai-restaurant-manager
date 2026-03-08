import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDataCoverage, type CoverageLevel } from "@/hooks/useDataCoverage";
import { useNavigate } from "react-router-dom";
import { Activity, ShoppingBag, Users, Package, CalendarDays, Wallet, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function CoverageRow({
  label,
  icon: Icon,
  covered,
  missing,
  level,
  route,
}: {
  label: string;
  icon: React.ElementType;
  covered: number;
  missing: number;
  level: CoverageLevel;
  route: string;
}) {
  const navigate = useNavigate();
  const statusText = level === "complete" ? "Complete" : level === "partial" ? `Missing ${missing} day${missing > 1 ? "s" : ""}` : "No data";
  const statusColor = level === "complete" ? "text-success" : level === "partial" ? "text-warning" : "text-destructive";

  return (
    <button
      onClick={() => navigate(route)}
      className="flex items-center justify-between w-full py-1.5 px-1 rounded-md hover:bg-secondary/50 transition-colors text-left"
    >
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm">{label}</span>
      </div>
      <span className={cn("text-xs font-medium", statusColor)}>{statusText}</span>
    </button>
  );
}

interface DataHealthPanelProps {
  locationId?: string | null;
}

export function DataHealthPanel({ locationId }: DataHealthPanelProps) {
  const { data: coverage, isLoading } = useDataCoverage(locationId);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Data Health
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!coverage) return null;

  const overallBadge = coverage.overallLevel === "complete"
    ? { label: "Healthy", variant: "default" as const, icon: CheckCircle2 }
    : coverage.overallLevel === "partial"
    ? { label: "Partial", variant: "secondary" as const, icon: AlertTriangle }
    : { label: "Gaps Found", variant: "destructive" as const, icon: AlertTriangle };

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Data Health
          </CardTitle>
          <Badge variant={overallBadge.variant} className="text-[10px] gap-1">
            <overallBadge.icon className="h-2.5 w-2.5" />
            {overallBadge.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-0.5">
        <CoverageRow label="Sales Data" icon={ShoppingBag} {...coverage.salesCoverage} route="/sales" />
        <CoverageRow label="Labour Data" icon={Users} {...coverage.labourCoverage} route="/attendance" />
        <CoverageRow label="Inventory" icon={Package} {...coverage.inventoryCoverage} route="/stock" />
        <CoverageRow label="Reservations" icon={CalendarDays} {...coverage.reservationsCoverage} route="/reservations" />
        <CoverageRow label="Financial" icon={Wallet} {...coverage.financialCoverage} route="/settings/financial/overheads" />

        {coverage.warnings.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border space-y-1.5">
            {coverage.warnings.slice(0, 3).map((w, i) => (
              <button
                key={i}
                onClick={() => w.route && navigate(w.route)}
                className="flex items-start gap-1.5 text-left w-full hover:bg-secondary/50 rounded px-1 py-0.5"
              >
                {w.severity === "error" ? (
                  <AlertTriangle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                ) : w.severity === "warning" ? (
                  <AlertTriangle className="h-3 w-3 text-warning shrink-0 mt-0.5" />
                ) : (
                  <Info className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <span className="text-[11px] text-muted-foreground">{w.message}</span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
