import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, CopyPlus, Trash2, AlertTriangle, Save } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { StaffShift } from "@/hooks/useShifts";

export interface ShiftFormValues {
  staff_id: string;
  location_id: string;
  date: string;
  start_time: string;
  end_time: string;
  notes: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = creating a new shift */
  shift: StaffShift | null;
  staff: { id: string; first_name: string; last_name: string; role?: string; max_hours_per_week?: number }[];
  locations: { id: string; name: string }[];
  weekDays: Date[];
  defaultLocationId?: string;
  onSave: (values: ShiftFormValues) => Promise<void> | void;
  onDuplicate?: (values: ShiftFormValues) => Promise<void> | void;
  onCopyToDay?: (values: ShiftFormValues, targetDate: string) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  /** Returns a conflict message when the values overlap another shift for the same employee. */
  findConflict: (values: ShiftFormValues, ignoreShiftId?: string) => string | null;
  isSaving?: boolean;
}

const emptyValues = (locationId = ""): ShiftFormValues => ({
  staff_id: "",
  location_id: locationId,
  date: format(new Date(), "yyyy-MM-dd"),
  start_time: "09:00",
  end_time: "17:00",
  notes: "",
});

export function ShiftEditDialog({
  open,
  onOpenChange,
  shift,
  staff,
  locations,
  weekDays,
  defaultLocationId,
  onSave,
  onDuplicate,
  onCopyToDay,
  onDelete,
  findConflict,
  isSaving,
}: Props) {
  const [values, setValues] = useState<ShiftFormValues>(emptyValues(defaultLocationId));
  const [copyTarget, setCopyTarget] = useState("");

  useEffect(() => {
    if (!open) return;
    if (shift) {
      const start = parseISO(shift.shift_start);
      const end = parseISO(shift.shift_end);
      setValues({
        staff_id: shift.staff_id,
        location_id: shift.location_id,
        date: format(start, "yyyy-MM-dd"),
        start_time: format(start, "HH:mm"),
        end_time: format(end, "HH:mm"),
        notes: shift.notes ?? "",
      });
    } else {
      setValues(emptyValues(defaultLocationId));
    }
    setCopyTarget("");
  }, [open, shift, defaultLocationId]);

  const set = (patch: Partial<ShiftFormValues>) => setValues((v) => ({ ...v, ...patch }));

  const selectedStaff = staff.find((s) => s.id === values.staff_id);
  const complete = !!values.staff_id && !!values.location_id && !!values.date && !!values.start_time && !!values.end_time;
  const conflict = complete ? findConflict(values, shift?.id) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {shift ? "Edit shift" : "New shift"}
            {shift?.is_draft && (
              <Badge variant="outline" className="border-amber-300 text-amber-700 text-[10px] dark:text-amber-400">
                DRAFT
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Planned labour only — actual attendance is never changed here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Employee</Label>
            <Select value={values.staff_id} onValueChange={(v) => set({ staff_id: v })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select staff" /></SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-sm">
                    {s.first_name} {s.last_name}
                    {s.role && <span className="ml-1.5 text-[10px] text-muted-foreground capitalize">({s.role.replace("_", " ")})</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedStaff?.max_hours_per_week != null && (
              <p className="text-[10px] text-muted-foreground">Contract max {selectedStaff.max_hours_per_week}h / week</p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Location</Label>
            <Select value={values.location_id} onValueChange={(v) => set({ location_id: v })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select location" /></SelectTrigger>
              <SelectContent>
                {locations.map((l) => <SelectItem key={l.id} value={l.id} className="text-sm">{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1 col-span-3 sm:col-span-1">
              <Label className="text-[11px] text-muted-foreground">Date</Label>
              <Input type="date" className="h-9 text-sm" value={values.date} onChange={(e) => set({ date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Start</Label>
              <Input type="time" className="h-9 text-sm" value={values.start_time} onChange={(e) => set({ start_time: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">End</Label>
              <Input type="time" className="h-9 text-sm" value={values.end_time} onChange={(e) => set({ end_time: e.target.value })} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Notes (optional)</Label>
            <Input className="h-9 text-sm" value={values.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Shift notes..." />
          </div>

          {conflict && (
            <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
              <span>{conflict}</span>
            </div>
          )}
        </div>

        <Button className="h-9 w-full" disabled={!complete || isSaving} onClick={() => onSave(values)}>
          <Save className="mr-1.5 h-3.5 w-3.5" /> {shift ? "Save changes" : "Create shift"}
        </Button>

        {shift && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-[11px] font-medium text-muted-foreground">Quick actions</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="h-9" onClick={() => onDuplicate?.(values)}>
                <CopyPlus className="mr-1.5 h-3.5 w-3.5" /> Duplicate
              </Button>
              {onDelete && (
                <Button variant="outline" size="sm" className="h-9 text-destructive" onClick={() => onDelete()}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Select value={copyTarget} onValueChange={setCopyTarget}>
                <SelectTrigger className="h-9 flex-1 text-sm"><SelectValue placeholder="Copy to another day…" /></SelectTrigger>
                <SelectContent>
                  {weekDays.map((d) => (
                    <SelectItem key={d.toISOString()} value={format(d, "yyyy-MM-dd")} className="text-sm">
                      {format(d, "EEE d MMM")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-9" disabled={!copyTarget}
                onClick={() => copyTarget && onCopyToDay?.(values, copyTarget)}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
