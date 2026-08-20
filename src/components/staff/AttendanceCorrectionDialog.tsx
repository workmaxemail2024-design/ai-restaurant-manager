import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Save, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useCorrectAttendance, useDeleteAttendance, type AttendanceRecordLike } from "@/hooks/useAttendanceEditing";
import { describeAttendanceSource } from "@/lib/attendanceSource";

interface Props {
  record: AttendanceRecordLike | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: { id: string; first_name: string; last_name: string; status?: string }[];
  locations: { id: string; name: string }[];
  canEdit: boolean;
  canDelete: boolean;
}

const toLocalInput = (iso: string | null) => (iso ? format(parseISO(iso), "yyyy-MM-dd'T'HH:mm") : "");

export function AttendanceCorrectionDialog({
  record,
  open,
  onOpenChange,
  staff,
  locations,
  canEdit,
  canDelete,
}: Props) {
  const correct = useCorrectAttendance();
  const remove = useDeleteAttendance();

  const [staffId, setStaffId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [reason, setReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!record) return;
    setStaffId(record.staff_id);
    setLocationId(record.location_id);
    setClockIn(toLocalInput(record.clock_in));
    setClockOut(toLocalInput(record.clock_out));
    setReason("");
    setConfirmDelete(false);
  }, [record]);

  if (!record) return null;

  const sourceInfo = describeAttendanceSource(record);
  const invalidRange = clockOut !== "" && new Date(clockOut) <= new Date(clockIn);

  const handleSave = async () => {
    if (!clockIn || invalidRange) return;
    await correct.mutateAsync({
      record,
      changes: {
        staff_id: staffId,
        location_id: locationId,
        clock_in: new Date(clockIn).toISOString(),
        clock_out: clockOut ? new Date(clockOut).toISOString() : null,
      },
      reason: reason.trim() || undefined,
    });
    onOpenChange(false);
  };

  const handleDelete = async () => {
    await remove.mutateAsync({ record, reason: reason.trim() || undefined });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            Correct attendance
            <Badge variant="secondary" className="text-[10px]">{sourceInfo.label}</Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Corrections only affect actual labour records. Planned shifts are never changed.
          </DialogDescription>
        </DialogHeader>

        {sourceInfo.isImported && (
          <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
            <span>
              Imported from Captiva/POS. The original values are preserved and the record is marked as an
              override — imported attendance cannot be deleted.
            </span>
          </div>
        )}

        {record.is_corrected && (
          <p className="text-[11px] text-muted-foreground">
            Original: {record.original_clock_in ? format(parseISO(record.original_clock_in), "MMM d, HH:mm") : "—"}
            {" → "}
            {record.original_clock_out ? format(parseISO(record.original_clock_out), "MMM d, HH:mm") : "open"}
          </p>
        )}

        <div className="space-y-2.5">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Employee</Label>
            <Select value={staffId} onValueChange={setStaffId} disabled={!canEdit}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select staff" /></SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-sm">
                    {s.first_name} {s.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Location</Label>
            <Select value={locationId} onValueChange={setLocationId} disabled={!canEdit}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select location" /></SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id} className="text-sm">{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Clock in</Label>
              <Input type="datetime-local" className="h-9 text-sm" value={clockIn} disabled={!canEdit}
                onChange={(e) => setClockIn(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Clock out</Label>
              <Input type="datetime-local" className="h-9 text-sm" value={clockOut} disabled={!canEdit}
                onChange={(e) => setClockOut(e.target.value)} />
            </div>
          </div>
          {invalidRange && <p className="text-[11px] text-destructive">Clock out must be after clock in.</p>}

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Reason (recorded in audit log)</Label>
            <Input className="h-9 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. staff finished 30 min later" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          {canDelete && !sourceInfo.isImported ? (
            confirmDelete ? (
              <Button variant="destructive" size="sm" className="h-9" onClick={handleDelete} disabled={remove.isPending}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Confirm remove
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="h-9 text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove record
              </Button>
            )
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {sourceInfo.isImported ? "Imported record — correction only" : ""}
            </span>
          )}
          <Button size="sm" className="h-9" onClick={handleSave}
            disabled={!canEdit || correct.isPending || invalidRange || !clockIn}>
            <Save className="mr-1.5 h-3.5 w-3.5" /> Save correction
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
