import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, CheckCircle2, Clock, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useDayLabour, useUpdateAttendanceTimes, LONG_SHIFT_HOURS } from "@/hooks/useDayLabour";
import { useDailyLedger } from "@/hooks/useDailyLedger";
import { useDashboardOverview } from "@/hooks/useDashboardOverview";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency } from "@/lib/currency";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  locationId: string | null;
}

/** yyyy-MM-ddTHH:mm for datetime-local inputs */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ISSUE_LABEL: Record<string, string> = {
  open: "No clock-out",
  negative: "Invalid hours",
  long: `Over ${LONG_SHIFT_HOURS}h shift`,
};

export function LabourReviewDialog({ open, onOpenChange, date, locationId }: Props) {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("staff", "edit");
  const canSeeCosts = hasPermission("finance", "view") || hasPermission("staff", "admin");

  const { data, isLoading } = useDayLabour(date, locationId);
  const updateTimes = useUpdateAttendanceTimes();
  const { entries, upsert, isSaving } = useDailyLedger(date, date, locationId);
  const { data: overview } = useDashboardOverview(locationId);
  const ledger = entries.get(date);

  const rows = data?.rows ?? [];
  const issues = rows.filter((r) => r.issue !== null);
  const totalHours = (data?.totalHours ?? 0) || (rows.length === 0 ? ledger?.labour_hours ?? 0 : 0);
  const totalCost = data?.totalCost ?? 0;
  const revenue = overview?.revenueToday ?? 0;
  const labourPct = revenue > 0 && totalCost > 0 ? (totalCost / revenue) * 100 : null;

  const [edits, setEdits] = useState<Record<string, { clock_in: string; clock_out: string }>>({});
  const [manualHours, setManualHours] = useState<string>("");

  useEffect(() => {
    if (open) {
      setEdits({});
      setManualHours(ledger?.labour_hours ? String(ledger.labour_hours) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, date, locationId]);

  const saveRow = (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const edit = edits[id];
    const clockIn = edit?.clock_in || toLocalInput(row.clock_in);
    const clockOut = edit?.clock_out ?? toLocalInput(row.clock_out);
    if (!clockIn) return;
    const inISO = new Date(clockIn).toISOString();
    const outISO = clockOut ? new Date(clockOut).toISOString() : null;
    if (outISO && new Date(outISO) <= new Date(inISO)) {
      toast({ title: "Clock-out must be after clock-in", variant: "destructive" });
      return;
    }
    updateTimes.mutate({ id, clock_in: inISO, clock_out: outISO });
  };

  const saveManualHours = () => {
    const hours = Number(manualHours);
    if (!Number.isFinite(hours) || hours < 0) {
      toast({ title: "Enter valid hours", variant: "destructive" });
      return;
    }
    upsert({
      entry_date: date,
      location_id: locationId,
      covers: ledger?.covers ?? 0,
      labour_hours: hours,
      additional_expenses: ledger?.additional_expenses ?? 0,
      notes: ledger?.notes ?? "",
      is_closed: ledger?.is_closed ?? false,
      manual_revenue: ledger?.manual_revenue ?? null,
      manual_orders: ledger?.manual_orders ?? null,
      covers_unknown: ledger?.covers_unknown ?? false,
    });
    toast({ title: "Manual labour hours saved" });
  };

  const confirmLabour = (confirmed: boolean) => {
    upsert({
      entry_date: date,
      location_id: locationId,
      covers: ledger?.covers ?? 0,
      labour_hours: ledger?.labour_hours ?? 0,
      additional_expenses: ledger?.additional_expenses ?? 0,
      notes: ledger?.notes ?? "",
      is_closed: ledger?.is_closed ?? false,
      manual_revenue: ledger?.manual_revenue ?? null,
      manual_orders: ledger?.manual_orders ?? null,
      covers_unknown: ledger?.covers_unknown ?? false,
      labour_confirmed: confirmed,
    });
    toast({ title: confirmed ? "Labour confirmed" : "Labour confirmation removed" });
    if (confirmed) onOpenChange(false);
  };

  const hasLabourData = rows.length > 0 || (ledger?.labour_hours ?? 0) > 0;
  const isConfirmed = ledger?.labour_confirmed === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Review Labour</DialogTitle>
          <DialogDescription>
            {format(parseISO(date), "EEE d MMM yyyy")} ·{" "}
            {locationId ? "Selected location" : "All locations"}
          </DialogDescription>
        </DialogHeader>

        {!locationId && (
          <p className="text-sm text-warning">
            Select a single location to confirm labour for the day.
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Total hours</p>
            <p className="text-lg font-semibold">{totalHours.toFixed(2)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Labour cost</p>
            <p className="text-lg font-semibold">
              {canSeeCosts ? formatCurrency(totalCost) : "—"}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Labour % of revenue</p>
            <p className="text-lg font-semibold">
              {canSeeCosts && labourPct != null ? `${labourPct.toFixed(1)}%` : "—"}
            </p>
          </div>
        </div>

        {issues.length > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
            <span>
              {issues.length} record{issues.length > 1 ? "s" : ""} need attention before confirming.
            </span>
          </div>
        )}

        <Separator />

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading attendance…</p>
        ) : rows.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No attendance records for this day. Enter manual labour hours instead.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="flex-1">
                <Label htmlFor="manual-hours">Manual labour hours</Label>
                <Input
                  id="manual-hours"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.25}
                  className="h-12 text-base"
                  value={manualHours}
                  onChange={(e) => setManualHours(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <Button
                className="h-12 px-6"
                onClick={saveManualHours}
                disabled={!canEdit || isSaving}
              >
                <Save className="h-4 w-4 mr-2" />
                Save hours
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const edit = edits[row.id];
              const clockIn = edit?.clock_in ?? toLocalInput(row.clock_in);
              const clockOut = edit?.clock_out ?? toLocalInput(row.clock_out);
              return (
                <div
                  key={row.id}
                  className={cn(
                    "rounded-lg border p-3 space-y-3",
                    row.issue && "border-warning/50 bg-warning/5"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{row.staffName}</span>
                      {row.issue && (
                        <Badge variant="outline" className="border-warning text-warning">
                          {ISSUE_LABEL[row.issue]}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {row.hours != null ? `${row.hours.toFixed(2)} h` : "—"}
                      {canSeeCosts && row.hourlyRate != null && (
                        <> · {formatCurrency(row.hourlyRate)}/h</>
                      )}
                      {canSeeCosts && row.cost != null && (
                        <> · <span className="font-medium text-foreground">{formatCurrency(row.cost)}</span></>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                    <div>
                      <Label className="text-xs">Clock in</Label>
                      <Input
                        type="datetime-local"
                        className="h-12 text-base"
                        value={clockIn}
                        disabled={!canEdit}
                        onChange={(e) =>
                          setEdits((p) => ({
                            ...p,
                            [row.id]: { clock_in: e.target.value, clock_out: clockOut },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Clock out</Label>
                      <Input
                        type="datetime-local"
                        className="h-12 text-base"
                        value={clockOut}
                        disabled={!canEdit}
                        onChange={(e) =>
                          setEdits((p) => ({
                            ...p,
                            [row.id]: { clock_in: clockIn, clock_out: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <Button
                      variant="outline"
                      className="h-12"
                      disabled={!canEdit || updateTimes.isPending}
                      onClick={() => saveRow(row.id)}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-12 px-6" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {isConfirmed ? (
            <Button
              variant="outline"
              className="h-12 px-6"
              disabled={!canEdit || isSaving || !locationId}
              onClick={() => confirmLabour(false)}
            >
              Unconfirm labour
            </Button>
          ) : (
            <Button
              className="h-12 px-6"
              disabled={!canEdit || isSaving || !hasLabourData || issues.length > 0 || !locationId}
              onClick={() => confirmLabour(true)}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirm labour
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
