import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Euro,
  Clock,
  Users,
  FileText,
  Wallet,
  Package,
  Lock,
  Camera,
  Plus,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDailyLedger, evaluateMissing } from "@/hooks/useDailyLedger";
import { useDashboardOverview } from "@/hooks/useDashboardOverview";
import { useLocation } from "@/contexts/LocationContext";
import { useDayDocuments } from "@/hooks/useDocuments";
import { QuickSupplierDocDialog } from "@/components/dashboard/QuickSupplierDocDialog";
import { QuickExpenseDialog } from "@/components/dashboard/QuickExpenseDialog";
import { LabourReviewDialog } from "@/components/dashboard/LabourReviewDialog";
import { useDayLabour } from "@/hooks/useDayLabour";
import { StockWastageDialog } from "@/components/dashboard/StockWastageDialog";
import { useDayStockAdjustments } from "@/hooks/useDayStock";
import { useDailyExpenses } from "@/hooks/useDailyExpenses";
import { formatCurrency } from "@/lib/currency";
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
        "rounded-lg border p-3 min-h-[104px] flex flex-col justify-between transition-colors",
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
  const { data: dayDocs = [] } = useDayDocuments(date, selectedLocationId);
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [labourDialogOpen, setLabourDialogOpen] = useState(false);
  const { data: dayLabour } = useDayLabour(date, selectedLocationId);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const { data: dayAdjustments = [] } = useDayStockAdjustments(date, selectedLocationId);
  const { data: dayExpenses = [] } = useDailyExpenses(date, selectedLocationId);
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
  // Expenses: real entries for the day, or an explicit "no expenses" confirmation
  const expenseTotal = dayExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const expensesConfirmed = ledger?.expenses_confirmed === true;
  const expensesOk = dayExpenses.length > 0 || expensesConfirmed;
  const isClosed = ledger?.is_closed ?? false;

  // Supplier docs (informational in this stage — does not block Close Day)
  const supplierDocs = selectedLocationId
    ? dayDocs.filter((d) => d.supplier_id != null && d.location_id === selectedLocationId)
    : [];
  const okDocs = supplierDocs.filter((d) => d.processing_status === "processed");
  const pendingDocs = supplierDocs.filter(
    (d) => d.processing_status !== "processed"
  );
  const docsState: TileState =
    !selectedLocationId
      ? "unknown"
      : okDocs.length > 0 && pendingDocs.length === 0
        ? "ok"
        : "warn";
  const docsDetail = !selectedLocationId
    ? "Select a location"
    : supplierDocs.length === 0
      ? "No supplier docs"
      : pendingDocs.length > 0
        ? `${supplierDocs.length} doc${supplierDocs.length > 1 ? "s" : ""} • ${pendingDocs.length} need review`
        : `${okDocs.length} processed`;

  // Labour: red = no data, amber = data but not reviewed, green = confirmed & clean
  const labourRows = dayLabour?.rows ?? [];
  const labourIssues = labourRows.filter((r) => r.issue !== null).length;
  const labourHours =
    (dayLabour?.totalHours ?? 0) > 0 ? dayLabour!.totalHours : ledger?.labour_hours ?? 0;
  const labourCost = dayLabour?.totalCost ?? 0;
  const labourRevenue = overview?.revenueToday ?? 0;
  const labourPct = labourRevenue > 0 && labourCost > 0 ? (labourCost / labourRevenue) * 100 : null;
  const hasLabourData = labourRows.length > 0 || (ledger?.labour_hours ?? 0) > 0;
  const labourConfirmed = ledger?.labour_confirmed === true;
  const labourState: TileState = !hasLabourData
    ? "missing"
    : labourConfirmed && labourIssues === 0
      ? "ok"
      : "warn";
  const labourDetail = !hasLabourData
    ? "No attendance or hours"
    : [
        `${labourHours.toFixed(1)}h`,
        labourCost > 0 ? formatCurrency(labourCost) : null,
        labourPct != null ? `${labourPct.toFixed(1)}% of revenue` : null,
        labourIssues > 0
          ? `${labourIssues} issue${labourIssues > 1 ? "s" : ""}`
          : labourConfirmed
            ? "Confirmed"
            : "Not reviewed",
      ]
        .filter(Boolean)
        .join(" • ");

  // Stock / wastage: amber until explicitly reviewed; does not block Close Day in this stage
  const stockReviewed = ledger?.stock_reviewed === true;
  const invalidAdjustments = dayAdjustments.filter((a) => a.isInvalid).length;
  const stockState: TileState =
    invalidAdjustments > 0 ? "warn" : stockReviewed ? "ok" : "warn";
  const stockDetail =
    invalidAdjustments > 0
      ? `${invalidAdjustments} adjustment${invalidAdjustments > 1 ? "s" : ""} need review`
      : stockReviewed
        ? dayAdjustments.length === 0
          ? "No wastage / adjustments"
          : `${dayAdjustments.length} adjustment${dayAdjustments.length > 1 ? "s" : ""} • ${dayAdjustments
              .reduce((sum, a) => sum + Math.abs(Number(a.quantity) || 0), 0)
              .toFixed(2)} items adjusted`
        : dayAdjustments.length > 0
          ? `${dayAdjustments.length} recorded • not reviewed`
          : "Not reviewed yet";

  // Close Day blocking rules (Stage 2E)
  const salesBlocked = !salesOk;
  const labourBlocked = !labourOk || !labourConfirmed;
  const coversBlocked = !coversOk;
  const expensesBlocked = !expensesOk;
  const stockBlocked = !stockReviewed;

  const blockers: string[] = [];
  if (salesBlocked) blockers.push("Sales");
  if (labourBlocked) blockers.push(labourOk ? "Labour review" : "Labour");
  if (coversBlocked) blockers.push("Covers");
  if (expensesBlocked) blockers.push("Expenses review");
  if (stockBlocked) blockers.push("Stock / Wastage review");
  const closeBlocked = !isClosed && blockers.length > 0;
  const blockerMessage =
    blockers.length > 0
      ? `Outstanding: ${blockers.join(", ").replace(/, ([^,]*)$/, " and $1")}`
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
      expenses_confirmed: ledger?.expenses_confirmed ?? false,
      labour_confirmed: ledger?.labour_confirmed ?? false,
      stock_reviewed: ledger?.stock_reviewed ?? false,
    });
  };


  return (
    <Card className="mt-4">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-base font-semibold">Daily Completion</h3>
          {closeBlocked ? (
            <span className="text-xs font-medium text-destructive">{blockerMessage}</span>
          ) : (
            <span className="text-xs text-muted-foreground">Selected day only</span>
          )}
        </div>

        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
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
            state={labourState}
            blocking={labourBlocked && !isClosed}
            detail={labourDetail}
            onClick={() => setLabourDialogOpen(true)}
            action={
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-10 w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  setLabourDialogOpen(true);
                }}
              >
                {labourConfirmed ? "View labour" : "Review labour"}
              </Button>
            }
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
            state={docsState}
            detail={docsDetail}
            onClick={() => navigate("/documents")}
            action={
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-10 w-full"
                disabled={!selectedLocationId}
                title={
                  selectedLocationId
                    ? undefined
                    : "Select a location to record a supplier delivery."
                }
                onClick={(e) => {
                  e.stopPropagation();
                  if (!selectedLocationId) return;
                  setDocDialogOpen(true);
                }}
              >
                <Camera className="h-4 w-4 mr-1" />
                Add doc
              </Button>
            }
          />
          <Tile
            label="Expenses"
            icon={Wallet}
            state={expensesOk ? "ok" : "warn"}
            blocking={expensesBlocked && !isClosed}
            detail={
              dayExpenses.length > 0
                ? `${dayExpenses.length} entr${dayExpenses.length === 1 ? "y" : "ies"} • ${formatCurrency(expenseTotal)}`
                : expensesConfirmed
                  ? "No expenses today (confirmed)"
                  : "Not reviewed yet — required to close"
            }

            onClick={() => setExpenseDialogOpen(true)}
            action={
              <div className="flex gap-1 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 flex-1"
                  disabled={!selectedLocationId}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpenseDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
                {dayExpenses.length === 0 && !expensesConfirmed && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-10 flex-1 text-xs"
                    disabled={isSaving}
                    onClick={(e) => {
                      e.stopPropagation();
                      upsert({
                        entry_date: date,
                        location_id: selectedLocationId ?? null,
                        covers: ledger?.covers ?? 0,
                        labour_hours: ledger?.labour_hours ?? 0,
                        additional_expenses: ledger?.additional_expenses ?? 0,
                        notes: ledger?.notes ?? "",
                        is_closed: isClosed,
                        manual_revenue: ledger?.manual_revenue ?? null,
                        manual_orders: ledger?.manual_orders ?? null,
                        covers_unknown: ledger?.covers_unknown ?? false,
                        expenses_confirmed: true,
                      });
                    }}
                  >
                    None today
                  </Button>
                )}
              </div>
            }
          />
          <Tile
            label="Stock / Wastage"
            icon={Package}
            state={stockState}
            blocking={stockBlocked && !isClosed}
            detail={stockDetail}


            onClick={() => setStockDialogOpen(true)}
            action={
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-10 w-full"
                disabled={!selectedLocationId}
                title={
                  selectedLocationId ? undefined : "Select a location to record wastage."
                }
                onClick={(e) => {
                  e.stopPropagation();
                  if (!selectedLocationId) return;
                  setStockDialogOpen(true);
                }}
              >
                {stockReviewed ? "View stock" : "Review stock"}
              </Button>
            }
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
                className="mt-2 h-10 w-full"
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

      <StockWastageDialog
        open={stockDialogOpen}
        onOpenChange={setStockDialogOpen}
        date={date}
        locationId={selectedLocationId}
      />

      <LabourReviewDialog
        open={labourDialogOpen}
        onOpenChange={setLabourDialogOpen}
        date={date}
        locationId={selectedLocationId}
      />

      <QuickExpenseDialog
        open={expenseDialogOpen}
        onOpenChange={setExpenseDialogOpen}
        date={date}
        locationId={selectedLocationId}
      />

      <QuickSupplierDocDialog
        open={docDialogOpen}
        onOpenChange={setDocDialogOpen}
        date={date}
        locationId={selectedLocationId}
      />
    </Card>
  );
}
