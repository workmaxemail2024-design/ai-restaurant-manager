import { useState, useMemo, useCallback } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, Clock, Wand2, Check, X, Euro, Move, AlertTriangle, CornerDownRight } from "lucide-react";
import {
  useStaffShifts, useStaffWithContracts, useCreateShift, useDeleteShift,
  useUpdateShift, useGenerateDraftRoster, useConfirmDraftRoster, useDiscardDraftRoster,
  StaffShift,
} from "@/hooks/useShifts";
import { useLocations } from "@/hooks/useLocations";
import { StaffWeeklyHoursSummary } from "@/components/shifts/StaffWeeklyHoursSummary";
import { ShiftEditDialog, type ShiftFormValues } from "@/components/shifts/ShiftEditDialog";
import { toast } from "@/hooks/use-toast";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, parseISO, isSameDay, differenceInMinutes, addDays } from "date-fns";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

/** Combine a yyyy-MM-dd date with a HH:mm time; end times before start roll into the next day. */
function buildRange(date: string, startTime: string, endTime: string) {
  const start = new Date(`${date}T${startTime}:00`);
  let end = new Date(`${date}T${endTime}:00`);
  if (end <= start) end = addDays(end, 1);
  return { start, end };
}

export default function ShiftSchedulerPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const { data: staff = [] } = useStaffWithContracts();
  const { data: locations = [] } = useLocations();
  const { data: shifts = [], isLoading } = useStaffShifts(weekStart.toISOString(), weekEnd.toISOString());

  const createShift = useCreateShift();
  const deleteShift = useDeleteShift();
  const updateShift = useUpdateShift();
  const generateDraft = useGenerateDraftRoster();
  const confirmDraft = useConfirmDraftRoster();
  const discardDraft = useDiscardDraftRoster();

  const [open, setOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<StaffShift | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  /** iPad-friendly alternative to drag & drop: tap a shift, then tap a day. */
  const [pendingMove, setPendingMove] = useState<{ shift: StaffShift; mode: "move" | "copy" } | null>(null);

  const draftShiftsCount = useMemo(() => shifts.filter((s) => s.is_draft).length, [shifts]);
  const hasDrafts = draftShiftsCount > 0;

  const staffRate = useCallback(
    (staffId: string) => staff.find((s) => s.id === staffId)?.hourly_rate || 0,
    [staff]
  );
  const staffName = useCallback(
    (staffId: string) => {
      const s = staff.find((x) => x.id === staffId);
      return s ? `${s.first_name} ${s.last_name}` : "this employee";
    },
    [staff]
  );

  // Weekly planned totals — recomputed from live shift data after every edit.
  const weeklyTotals = useMemo(() => {
    let totalHours = 0;
    let totalCost = 0;
    shifts.forEach((s) => {
      const hours = differenceInMinutes(parseISO(s.shift_end), parseISO(s.shift_start)) / 60;
      totalHours += hours;
      totalCost += hours * staffRate(s.staff_id);
    });
    return { totalHours, totalCost };
  }, [shifts, staffRate]);

  /** Overlap detection for the same employee. */
  const conflictFor = useCallback(
    (staffId: string, start: Date, end: Date, ignoreId?: string): string | null => {
      const clash = shifts.find((s) => {
        if (s.staff_id !== staffId || s.id === ignoreId) return false;
        const sStart = parseISO(s.shift_start);
        const sEnd = parseISO(s.shift_end);
        return start < sEnd && end > sStart;
      });
      if (!clash) return null;
      return `${staffName(staffId)} already has a shift ${format(parseISO(clash.shift_start), "EEE HH:mm")}–${format(
        parseISO(clash.shift_end),
        "HH:mm"
      )}. Overlapping shifts will both count towards planned hours.`;
    },
    [shifts, staffName]
  );

  const findConflict = useCallback(
    (values: ShiftFormValues, ignoreShiftId?: string) => {
      const { start, end } = buildRange(values.date, values.start_time, values.end_time);
      return conflictFor(values.staff_id, start, end, ignoreShiftId);
    },
    [conflictFor]
  );

  const openNewShift = () => {
    setEditingShift(null);
    setOpen(true);
  };

  const handleSave = async (values: ShiftFormValues) => {
    const { start, end } = buildRange(values.date, values.start_time, values.end_time);
    const payload = {
      staff_id: values.staff_id,
      location_id: values.location_id,
      shift_start: start.toISOString(),
      shift_end: end.toISOString(),
      notes: values.notes || undefined,
    };
    if (editingShift) {
      await updateShift.mutateAsync({ id: editingShift.id, ...payload });
    } else {
      await createShift.mutateAsync(payload);
    }
    const conflict = conflictFor(values.staff_id, start, end, editingShift?.id);
    if (conflict) toast({ title: "Overlapping shift", description: conflict });
    setOpen(false);
    setEditingShift(null);
  };

  const handleDuplicate = async (values: ShiftFormValues) => {
    const { start, end } = buildRange(values.date, values.start_time, values.end_time);
    await createShift.mutateAsync({
      staff_id: values.staff_id,
      location_id: values.location_id,
      shift_start: start.toISOString(),
      shift_end: end.toISOString(),
      notes: values.notes || undefined,
      is_draft: editingShift?.is_draft ?? false,
    });
    setOpen(false);
    setEditingShift(null);
  };

  const handleCopyToDay = async (values: ShiftFormValues, targetDate: string) => {
    await handleDuplicate({ ...values, date: targetDate });
  };

  const handleDelete = async () => {
    if (!editingShift) return;
    await deleteShift.mutateAsync(editingShift.id);
    setOpen(false);
    setEditingShift(null);
  };

  /** Move or copy a shift to another day, preserving its duration and times. */
  const applyToDay = useCallback(
    async (shift: StaffShift, day: Date, mode: "move" | "copy") => {
      const start = parseISO(shift.shift_start);
      const end = parseISO(shift.shift_end);
      if (mode === "move" && isSameDay(start, day)) return;

      const durationMs = end.getTime() - start.getTime();
      const newStart = new Date(day);
      newStart.setHours(start.getHours(), start.getMinutes(), 0, 0);
      const newEnd = new Date(newStart.getTime() + durationMs);

      if (mode === "move") {
        await updateShift.mutateAsync({
          id: shift.id,
          shift_start: newStart.toISOString(),
          shift_end: newEnd.toISOString(),
        });
      } else {
        await createShift.mutateAsync({
          staff_id: shift.staff_id,
          location_id: shift.location_id,
          shift_start: newStart.toISOString(),
          shift_end: newEnd.toISOString(),
          notes: shift.notes ?? undefined,
          is_draft: shift.is_draft,
        });
      }

      const conflict = conflictFor(shift.staff_id, newStart, newEnd, mode === "move" ? shift.id : undefined);
      if (conflict) toast({ title: "Overlapping shift", description: conflict });
    },
    [conflictFor, createShift, updateShift]
  );

  const handleDropOnDay = (day: Date) => (e: React.DragEvent) => {
    e.preventDefault();
    const payload = e.dataTransfer.getData("text/plain");
    if (!payload) return;
    const [mode, id] = payload.split(":");
    const shift = shifts.find((s) => s.id === id);
    if (shift) applyToDay(shift, day, mode === "copy" ? "copy" : "move");
  };

  const handleTapDay = (day: Date) => {
    if (!pendingMove) return;
    applyToDay(pendingMove.shift, day, pendingMove.mode);
    setPendingMove(null);
  };

  const handleGenerateDraft = async () => {
    if (!selectedLocation) return;
    await generateDraft.mutateAsync({ weekStart, locationId: selectedLocation });
  };
  const handleConfirmDraft = async () => {
    if (!selectedLocation) return;
    await confirmDraft.mutateAsync({ weekStart, locationId: selectedLocation });
  };
  const handleDiscardDraft = async () => {
    if (!selectedLocation) return;
    await discardDraft.mutateAsync({ weekStart, locationId: selectedLocation });
  };

  const getShiftsForDay = (day: Date) => shifts.filter((shift) => isSameDay(parseISO(shift.shift_start), day));

  const navigateWeek = (direction: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + direction * 7);
    setSelectedDate(newDate);
  };

  /** Employees with overlapping planned shifts this week. */
  const overlapWarnings = useMemo(() => {
    const messages: string[] = [];
    const sorted = [...shifts].sort((a, b) => a.shift_start.localeCompare(b.shift_start));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[i].staff_id !== sorted[j].staff_id) continue;
        if (parseISO(sorted[i].shift_end) > parseISO(sorted[j].shift_start)) {
          const label = `${staffName(sorted[i].staff_id)} on ${format(parseISO(sorted[j].shift_start), "EEE d MMM")}`;
          if (!messages.includes(label)) messages.push(label);
        }
      }
    }
    return messages;
  }, [shifts, staffName]);

  return (
    <PageLayout
      title="Timesheets"
      description="Planned labour — drag, tap or edit shifts to build the weekly rota"
      action={
        <Button size="sm" className="h-8" onClick={openNewShift}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Shift
        </Button>
      }
    >
      <div className="space-y-3">
        {/* Weekly Planned Summary */}
        <div className="flex flex-wrap items-center gap-4 p-3 bg-muted/50 rounded-lg border text-sm">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Planned Hours:</span>
            <span className="font-semibold">{weeklyTotals.totalHours.toFixed(1)}h</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <Euro className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Planned Cost:</span>
            <span className="font-semibold">{formatCurrency(weeklyTotals.totalCost)}</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <span className="text-muted-foreground">
            {shifts.length} shift{shifts.length !== 1 ? "s" : ""}
            {hasDrafts && <span className="text-warning ml-1">({draftShiftsCount} draft)</span>}
          </span>
        </div>

        {overlapWarnings.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
            <span>Overlapping shifts: {overlapWarnings.join(", ")}</span>
          </div>
        )}

        {/* Staff Weekly Hours Summary */}
        <StaffWeeklyHoursSummary shifts={shifts} staff={staff} selectedLocation={selectedLocation} />

        {/* Draft Roster Controls */}
        <Card className="border-dashed border-border/60">
          <CardContent className="py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Wand2 className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger className="w-40 h-7 text-xs"><SelectValue placeholder="Location" /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleGenerateDraft}
                disabled={!selectedLocation || generateDraft.isPending || hasDrafts}>
                <Wand2 className="mr-1 h-3 w-3" /> Generate
              </Button>
              {hasDrafts && (
                <>
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] h-5 px-1.5">
                    {draftShiftsCount} Draft
                  </Badge>
                  <Button variant="default" size="sm" className="h-7 text-xs" onClick={handleConfirmDraft}
                    disabled={confirmDraft.isPending || !selectedLocation}>
                    <Check className="mr-1 h-3 w-3" /> Confirm
                  </Button>
                  <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={handleDiscardDraft}
                    disabled={discardDraft.isPending || !selectedLocation}>
                    <X className="mr-1 h-3 w-3" /> Discard
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Week Navigation */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigateWeek(-1)}>← Previous</Button>
          <div className="flex items-center gap-1.5 text-xs">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}</span>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigateWeek(1)}>Next →</Button>
        </div>

        {/* Touch move / copy banner */}
        {pendingMove && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-2.5 text-xs">
            <Move className="h-3.5 w-3.5 text-primary" />
            <span>
              {pendingMove.mode === "move" ? "Moving" : "Copying"}{" "}
              <span className="font-medium">
                {pendingMove.shift.staff?.first_name} {pendingMove.shift.staff?.last_name}
              </span>{" "}
              — tap a day to place the shift.
            </span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPendingMove(null)}>Cancel</Button>
          </div>
        )}

        {/* Week Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-1.5">
          {weekDays.map((day) => {
            const dayShifts = getShiftsForDay(day);
            const isToday = isSameDay(day, new Date());
            const dayHours = dayShifts.reduce(
              (sum, s) => sum + differenceInMinutes(parseISO(s.shift_end), parseISO(s.shift_start)) / 60,
              0
            );
            const dayCost = dayShifts.reduce((sum, s) => {
              const hours = differenceInMinutes(parseISO(s.shift_end), parseISO(s.shift_start)) / 60;
              return sum + hours * staffRate(s.staff_id);
            }, 0);

            return (
              <Card
                key={day.toISOString()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDropOnDay(day)}
                onClick={() => handleTapDay(day)}
                className={cn(
                  "transition-colors",
                  isToday && "border-primary ring-1 ring-primary/20",
                  pendingMove && "cursor-pointer border-primary/60 bg-primary/5"
                )}
              >
                <CardHeader className="p-2 pb-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className={`text-[10px] uppercase tracking-wider ${isToday ? "text-primary" : "text-muted-foreground"}`}>{format(day, "EEE")}</span>
                      <p className={`text-lg font-semibold leading-none ${isToday ? "text-primary" : ""}`}>{format(day, "d")}</p>
                    </div>
                    {dayShifts.length > 0 && (
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground">{dayHours.toFixed(1)}h</p>
                        <p className="text-[10px] font-medium text-primary">{formatCurrency(dayCost)}</p>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-2 pt-0 space-y-1">
                  {isLoading ? (
                    <div className="h-12 animate-pulse bg-muted rounded" />
                  ) : dayShifts.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground py-2">
                      {pendingMove ? "Tap to place here" : "No shifts"}
                    </p>
                  ) : (
                    dayShifts.map((shift) => (
                      <div
                        key={shift.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", `move:${shift.id}`)}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (pendingMove) {
                            handleTapDay(day);
                            return;
                          }
                          setEditingShift(shift);
                          setOpen(true);
                        }}
                        className={cn(
                          "p-1.5 rounded border text-xs cursor-pointer select-none active:opacity-70",
                          shift.is_draft
                            ? "bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700"
                            : "bg-primary/5 border-primary/20"
                        )}
                      >
                        <div className="flex justify-between items-start gap-1">
                          <div className="flex-1 min-w-0">
                            {shift.is_draft && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 mb-0.5 bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">DRAFT</Badge>
                            )}
                            <div className="font-medium text-[11px] truncate">{shift.staff?.first_name} {shift.staff?.last_name}</div>
                          </div>
                          <div className="flex gap-0.5 shrink-0">
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                              title="Move to another day"
                              onClick={(e) => { e.stopPropagation(); setPendingMove({ shift, mode: "move" }); }}>
                              <Move className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                              title="Copy to another day"
                              onClick={(e) => { e.stopPropagation(); setPendingMove({ shift, mode: "copy" }); }}>
                              <CornerDownRight className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground mt-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          <span className="text-[10px]">{format(parseISO(shift.shift_start), "HH:mm")}–{format(parseISO(shift.shift_end), "HH:mm")}</span>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Drag a shift onto another day, or tap the move / copy icons and then tap a day. Moving a shift keeps its
          duration and never changes recorded attendance.
        </p>
      </div>

      <ShiftEditDialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) setEditingShift(null); }}
        shift={editingShift}
        staff={staff}
        locations={locations}
        weekDays={weekDays}
        defaultLocationId={selectedLocation || locations[0]?.id}
        onSave={handleSave}
        onDuplicate={handleDuplicate}
        onCopyToDay={handleCopyToDay}
        onDelete={handleDelete}
        findConflict={findConflict}
        isSaving={createShift.isPending || updateShift.isPending}
      />
    </PageLayout>
  );
}
