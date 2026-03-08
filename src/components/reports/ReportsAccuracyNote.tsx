import { useDataCoverage } from "@/hooks/useDataCoverage";
import { AlertTriangle, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface ReportsAccuracyNoteProps {
  locationId?: string | null;
}

export function ReportsAccuracyNote({ locationId }: ReportsAccuracyNoteProps) {
  const { data: coverage } = useDataCoverage(locationId);
  const navigate = useNavigate();

  if (!coverage || coverage.overallLevel === "complete") return null;

  const criticalWarnings = coverage.warnings.filter(w => w.severity === "warning" || w.severity === "error");
  if (criticalWarnings.length === 0) return null;

  return (
    <div className="rounded-md border border-warning/30 bg-warning/5 p-3 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
        <span className="text-xs font-medium text-warning">Some metrics are estimated due to missing operational data</span>
      </div>
      <div className="space-y-1 pl-5">
        {criticalWarnings.slice(0, 4).map((w, i) => (
          <button
            key={i}
            onClick={() => w.route && navigate(w.route)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Info className="h-2.5 w-2.5 shrink-0" />
            <span>{w.message}</span>
            {w.page && <span className="text-primary underline">→ {w.page}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
