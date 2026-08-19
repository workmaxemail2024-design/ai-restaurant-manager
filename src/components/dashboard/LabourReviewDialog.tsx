import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, CheckCircle2, Clock, Plus, Save } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  useDayLabour,
  useUpdateAttendanceTimes,
  useAddManualAttendance,
  LONG_SHIFT_HOURS,
} from "@/hooks/useDayLabour";
import { useDailyLedger } from "@/hooks/useDailyLedger";
import { useDashboardOverview } from "@/hooks/useDashboardOverview";
import { useStaff } from "@/hooks/useStaff";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency } from "@/lib/currency";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { LabourEvidenceCard } from "@/components/dashboard/LabourEvidenceCard";
import { STAFF_DEPARTMENTS, departmentLabel, type StaffDepartment } from "@/lib/labour";
import { LabourTotals } from "@/components/dashboard/LabourTotals";


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
  const salariedRows = data?.salariedRows ?? [];
  const issues = rows.filter((r) => r.issue !== null);
  const totalHours = (data?.totalHours ?? 0) || (rows.length === 0 ? ledger?.labour_hours ?? 0 : 0);
  const totalCost = data?.totalCost ?? 0;
  const revenue = overview?.revenueToday ?? 0;
  const labourPct = revenue > 0 && totalCost > 0 ? (totalCost / revenue) * 100 : null;

  const [edits, setEdits] = useState<Record<string, { clock_in: string; clock_out: string }>>({});
  const [entries2, setEntries] = useState<Record<string, { hours: string; selected: boolean }>>({});

  const addManual = useAddManualAttendance();
  const { data: staffList = [] } = useStaff(locationId ?? undefined);
  const activeStaff = staffList.filter((s: any) => s.status === "active");

  // Staff without a recorded attendance row for this day can have hours entered.
  const recordedStaffIds = new Set(rows.map((r) => r.staff_id));
  const entryStaff = activeStaff.filter((s: any) => !recordedStaffIds.has(s.id));
  const groupedEntryStaff = entryStaff.reduce<Record<string, any[]>>((acc, s: any) => {
    const key = s.department ?? "other";
    (acc[key] ??= []).push(s);
    return acc;
  }, {});
  const selectedCount = Object.values(entries2).filter((e) => e.selected).length;

  // Labour cost per department: hourly worked cost + allocated salaried cost.
  const deptCosts = (() => {
    const totals: Record<StaffDepartment, number> = { floor: 0, kitchen: 0, management: 0, other: 0 };
    for (const r of rows) if (r.cost != null) totals[r.department] += r.cost;
    for (const s of salariedRows) totals[s.department] += s.cost;
    return totals;
  })();

  const saveSelectedHours = async () => {
    if (!locationId) return;
    const picks = Object.entries(entries2).filter(([, e]) => e.selected);
    const invalid = picks.filter(([, e]) => !(Number(e.hours) > 0));
    if (picks.length === 0 || invalid.length > 0) {
      toast({ title: "Enter hours for every selected employee", variant: "destructive" });
      return;
    }
    for (const [id, e] of picks) {
      await addManual.mutateAsync({
        staff_id: id,
        location_id: locationId,
        date,
        hours: Number(e.hours),
      });
    }
    setEntries({});
  };

  useEffect(() => {
    if (open) {
      setEdits({});
      setEntries({});
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

  // Clock-in/out in RestaurantAI is optional: a manager may confirm a reviewed day
  // even when no attendance was imported (e.g. hours recorded manually or none worked).
  const hasLabourData = true;

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

        <LabourTotals
          totalHours={totalHours}
          totalCost={totalCost}
          hourlyCost={data?.hourlyCost ?? 0}
          salaryCost={data?.salaryCost ?? 0}
          deptCosts={deptCosts}
          labourPct={labourPct}
          canSeeCosts={canSeeCosts}
        />

        {issues.length > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
            <span>
              {issues.length} record{issues.length > 1 ? "s" : ""} need attention before confirming.
            </span>
          </div>
        )}

        <LabourEvidenceCard date={date} locationId={locationId} disabled={!canEdit} />

        {salariedRows.length > 0 && (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Salaried staff (allocated)</p>
              <p className="text-sm font-semibold">
                {canSeeCosts ? formatCurrency(data?.salaryCost ?? 0) : "—"}
              </p>
            </div>
            {salariedRows.map((s) => (
              <div key={s.staffId} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  {s.staffName}
                  <Badge variant="secondary">Salary</Badge>
                  <Badge variant="outline">{departmentLabel(s.department)}</Badge>
                </span>
                <span className="text-muted-foreground text-xs">
                  {s.derivation}
                  {canSeeCosts && <> · {formatCurrency(s.cost)}</>}
                </span>
              </div>
            ))}
          </div>
        )}

        <Separator />

        {/* Employee-level hours entry, grouped by department */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold">
              {rows.length === 0 ? "No attendance imported yet" : "Add employees who worked"}
            </p>
            <p className="text-sm text-muted-foreground">
              Select everyone who worked and enter their hours. Cost is calculated from each
              employee's stored pay details.
            </p>
          </div>

          {!locationId ? (
            <p className="text-sm text-muted-foreground">
              Select a single location to record employee hours.
            </p>
          ) : entryStaff.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              All active staff at this location already have hours recorded for this day.
            </p>
          ) : (
            <div className="space-y-4">
              {STAFF_DEPARTMENTS.filter((d) => (groupedEntryStaff[d.value] ?? []).length > 0).map((dept) => (
                <div key={dept.value} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {dept.label}
                  </p>
                  {(groupedEntryStaff[dept.value] ?? []).map((s: any) => {
                    const entry = entries2[s.id];
                    const selected = !!entry?.selected;
                    const hours = Number(entry?.hours);
                    const isSalary = s.pay_type === "salary";
                    const lineCost =
                      !isSalary && Number.isFinite(hours) && hours > 0 && s.hourly_rate != null
                        ? hours * Number(s.hourly_rate)
                        : null;
                    return (
                      <div
                        key={s.id}
                        className={cn(
                          "flex flex-wrap items-center gap-3 rounded-lg border p-3",
                          selected && "border-primary/50 bg-primary/5"
                        )}
                      >
                        <Checkbox
                          checked={selected}
                          disabled={!canEdit}
                          onCheckedChange={(v) =>
                            setEntries((p) => ({
                              ...p,
                              [s.id]: { hours: p[s.id]?.hours ?? "", selected: v === true },
                            }))
                          }
                        />
                        <div className="min-w-[9rem] flex-1">
                          <p className="font-medium text-sm">
                            {s.first_name} {s.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Badge variant="secondary" className="text-[10px]">
                              {isSalary ? "Salary" : "Hourly"}
                            </Badge>
                            {canSeeCosts && !isSalary && s.hourly_rate != null && (
                              <>{formatCurrency(Number(s.hourly_rate))}/h</>
                            )}
                            {isSalary && <>allocated from salary</>}
                          </p>
                        </div>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={0.25}
                          placeholder="Hours"
                          className="h-12 w-28 text-base"
                          disabled={!canEdit || !selected}
                          value={entry?.hours ?? ""}
                          onChange={(e) =>
                            setEntries((p) => ({
                              ...p,
                              [s.id]: { hours: e.target.value, selected: true },
                            }))
                          }
                        />
                        <div className="w-24 text-right text-sm font-medium">
                          {canSeeCosts && lineCost != null ? formatCurrency(lineCost) : isSalary ? "—" : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              <Button
                className="h-12 px-6"
                disabled={!canEdit || !locationId || addManual.isPending || selectedCount === 0}
                onClick={saveSelectedHours}
              >
                <Plus className="h-4 w-4 mr-2" />
                Save hours for {selectedCount} employee{selectedCount === 1 ? "" : "s"}
              </Button>
            </div>
          )}
        </div>

        <Separator />

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading attendance…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recorded hours for this day yet.</p>
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
                      <Badge variant="secondary">{row.payType === "salary" ? "Salary" : "Hourly"}</Badge>
                      {row.issue && (
                        <Badge variant="outline" className="border-warning text-warning">
                          {ISSUE_LABEL[row.issue]}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {row.hours != null ? `${row.hours.toFixed(2)} h` : "—"}
                      {canSeeCosts && row.payType === "hourly" && row.hourlyRate != null && (
                        <> · {formatCurrency(row.hourlyRate)}/h</>
                      )}
                      {row.payType === "salary" && <> · hours not priced hourly</>}
                      <div className="text-xs">{row.derivation}</div>
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

        <LabourTotals
          totalHours={totalHours}
          totalCost={totalCost}
          hourlyCost={data?.hourlyCost ?? 0}
          salaryCost={data?.salaryCost ?? 0}
          deptCosts={deptCosts}
          labourPct={labourPct}
          canSeeCosts={canSeeCosts}
        />

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
