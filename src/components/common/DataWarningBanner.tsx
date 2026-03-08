import { useDataCoverage, type DataWarning } from "@/hooks/useDataCoverage";
import { AlertTriangle, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface DataWarningBannerProps {
  locationId?: string | null;
  /** Only show warnings matching these types */
  filterTypes?: DataWarning["type"][];
  className?: string;
}

export function DataWarningBanner({ locationId, filterTypes, className }: DataWarningBannerProps) {
  const { data: coverage } = useDataCoverage(locationId);
  const navigate = useNavigate();

  if (!coverage) return null;

  const warnings = filterTypes
    ? coverage.warnings.filter(w => filterTypes.includes(w.type))
    : coverage.warnings;

  if (warnings.length === 0) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      {warnings.map((w, i) => (
        <button
          key={i}
          onClick={() => w.route && navigate(w.route)}
          className={cn(
            "flex items-center gap-2 w-full text-left rounded-md px-3 py-2 text-xs transition-colors",
            w.severity === "error" && "bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/15",
            w.severity === "warning" && "bg-warning/10 border border-warning/20 text-warning hover:bg-warning/15",
            w.severity === "info" && "bg-secondary border border-border text-muted-foreground hover:bg-secondary/80",
          )}
        >
          {w.severity === "info" ? (
            <Info className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          )}
          <span>{w.message}</span>
          {w.page && <span className="ml-auto text-primary underline shrink-0">→ {w.page}</span>}
        </button>
      ))}
    </div>
  );
}
