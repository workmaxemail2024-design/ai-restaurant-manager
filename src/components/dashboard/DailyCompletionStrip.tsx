import { useNavigate } from "react-router-dom";
import {
  Euro,
  Clock,
  Users,
  FileText,
  Wallet,
  Package,
  Lock,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDailyLedger, evaluateMissing } from "@/hooks/useDailyLedger";
import { useDashboardOverview } from "@/hooks/useDashboardOverview";
import { useLocation } from "@/contexts/LocationContext";
import { cn } from "@/lib/utils";

type TileState = "ok" | "warn" | "missing" | "unknown";

const STATE_STYLES: Record<TileState, string> = {
  ok: "border-success/40 bg-success/10 text-success",
  warn: "border-warning/40 bg-warning/10 text-warning",
  missing: "border-destructive/40 bg-destructive/10 text-destructive",
  unknown: "border-border bg-muted/40 text-muted-foreground",
};

const STATE_ICON: Record<TileState, React.ElementType> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  missing: AlertTriangle,
  unknown: HelpCircle,
};

function Tile({
  label,
  detail,
  state,
  icon: Icon,
  onClick,
  action,
  blocking,
}: {
  label: string;
  detail: string;
  state: TileState;
  icon: React.ElementType;
  onClick?: () => void;
  action?: React.ReactNode;
  blocking?: boolean;
}) {
  const StateIcon = STATE_ICON[state];
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) onClick();
      }}
      className={cn(
        "min-w-[150px] flex-1 rounded-lg border p-3 min-h-[92px] flex flex-col justify-between transition-colors",
        STATE_STYLES[state],
        blocking && "ring-2 ring-destructive ring-offset-1 ring-offset-background",
        onClick && "cursor-pointer hover:opacity-90"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="text-sm font-semibold text-foreground">{label}</span>
        </div>
        <StateIcon className="h-4 w-4 shrink-0" />
      </div>
      <p className="text-xs text-foreground/70 mt-2">{detail}</p>
      {action}
    </div>
  );
}

interface Props {
  /** Single selected day (yyyy-MM-dd) */
  date: string;
}

export function DailyCompletionStrip({ date }: Props) {
  const navigate = useNavigate();
  const { selectedLocationId } = useLocation();
  const { data: overview } = useDashboardOverview(selectedLocationId);
  const { entries, upsert, isSaving } = useDailyLedger(date, date, selectedLocationId);
  const ledger = entries.get(date);

  const captivaCovers = overview?.visitorsToday ?? null;
  const hasSalesData = (overview?.revenueToday ?? 0) > 0;

  // Single source of truth for completion rules
  const { checklist } = evaluateMissing(
    hasSalesData,
    ledger,
    undefined,
    captivaCovers,
    overview?.hasLabourToday ? 1 : 0
  );

  const salesOk = checklist.SALES;
  const labourOk = checklist.LABOUR_HOURS;
  const coversOk = checklist.COVERS;
  const expensesOk = checklist.EXPENSES;
  const isClosed = ledger?.is_closed ?? false;

  const blockers: string[] = [];
  if (!salesOk) blockers.push("Sales");
  if (!labourOk) blockers.push("Labour");
  if (!coversOk) blockers.push("Covers");
  const closeBlocked = !isClosed && blockers.length > 0;
  const blockerMessage =
    blockers.length > 0
      ? `Complete ${blockers.join(", ").replace(/, ([^,]*)$/, " and $1")} before closing this day`
      : "";

  const handleCloseDay = () => {
    if (closeBlocked) return;
    upsert({
      entry_date: date,
      location_id: selectedLocationId ?? null,
      covers: ledger?.covers ?? 0,
      labour_hours: ledger?.labour_hours ?? 0,
      additional_expenses: ledger?.additional_expenses ?? 0,
      notes: ledger?.notes ?? "",
      is_closed: !isClosed,
      manual_revenue: ledger?.manual_revenue ?? null,
      manual_orders: ledger?.manual_orders ?? null,
      covers_unknown: ledger?.covers_unknown ?? false,
    });
  };

  return (
    <Card className="mt-4">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Daily Completion</h3>
          {closeBlocked ? (
            <span className="text-xs font-medium text-destructive">{blockerMessage}</span>
          ) : (
            <span className="text-xs text-muted-foreground">Selected day only</span>
          )}
        </div>

        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
          <Tile
            label="Sales"
            icon={Euro}
            state={salesOk ? "ok" : "missing"}
            blocking={!salesOk && !isClosed}
            detail={salesOk ? "Revenue recorded" : "No sales or manual revenue"}
            onClick={() => navigate("/sales")}
          />
          <Tile
            label="Labour"
            icon={Clock}
            state={labourOk ? "ok" : "missing"}
            blocking={!labourOk && !isClosed}
            detail={labourOk ? "Attendance / hours logged" : "No attendance or hours"}
            onClick={() => navigate("/attendance")}
          />
          <Tile
            label="Covers"
            icon={Users}
            state={coversOk ? "ok" : "missing"}
            blocking={!coversOk && !isClosed}
            detail={
              captivaCovers != null && captivaCovers > 0
                ? `${captivaCovers} from POS`
                : (ledger?.covers ?? 0) > 0
                  ? `${ledger?.covers} logged`
                  : ledger?.covers_unknown
                    ? "Marked unknown"
                    : "Not recorded"
            }
            onClick={() => navigate("/reports")}
          />
          <Tile
            label="Supplier Docs"
            icon={FileText}
            state="unknown"
            detail="Not checked yet"
            onClick={() => navigate("/documents")}
          />
          <Tile
            label="Expenses"
            icon={Wallet}
            state={expensesOk ? "ok" : "warn"}
            detail={expensesOk ? "Daily ledger entry exists" : "No ledger entry yet"}
            onClick={() => navigate("/reports")}
          />
          <Tile
            label="Stock / Wastage"
            icon={Package}
            state="unknown"
            detail="Not checked yet"
            onClick={() => navigate("/stock")}
          />
          <Tile
            label="Close Day"
            icon={Lock}
            state={isClosed ? "ok" : closeBlocked ? "missing" : "warn"}
            detail={
              isClosed
                ? "Day closed"
                : closeBlocked
                  ? blockerMessage
                  : "Ready to close"
            }
            action={
              <Button
                size="sm"
                variant={isClosed ? "outline" : "default"}
                className="mt-2 h-9 w-full"
                disabled={isSaving || closeBlocked}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseDay();
                }}
              >
                {isClosed ? "Reopen" : "Close day"}
              </Button>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
