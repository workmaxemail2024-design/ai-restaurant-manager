import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Calendar, Clock, Trash2 } from "lucide-react";
import { useStaff, useStaffShifts, useCreateShift, useDeleteShift } from "@/hooks/useStaff";
import { useLocations } from "@/hooks/useLocations";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, parseISO, isSameDay } from "date-fns";

export default function ShiftSchedulerPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const { data: staff = [] } = useStaff();
  const { data: locations = [] } = useLocations();
  const { data: shifts = [], isLoading } = useStaffShifts(weekStart.toISOString(), weekEnd.toISOString());
  const createShift = useCreateShift();
  const deleteShift = useDeleteShift();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    staff_id: "",
    location_id: "",
    shift_start: "",
    shift_end: "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createShift.mutateAsync(form);
    setOpen(false);
    setForm({ staff_id: "", location_id: "", shift_start: "", shift_end: "", notes: "" });
  };

  const getShiftsForDay = (day: Date) => {
    return shifts.filter((shift) => isSameDay(parseISO(shift.shift_start), day));
  };

  return (
    <PageLayout
      title="Shift Scheduler"
      description="Plan and manage staff schedules"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Add Shift</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Shift</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Staff Member</Label>
                <Select value={form.staff_id} onValueChange={(v) => setForm({ ...form, staff_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                  <SelectContent>
                    {staff.filter(s => s.status === "active").map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Select value={form.location_id} onValueChange={(v) => setForm({ ...form, location_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Shift Start</Label>
                  <Input type="datetime-local" value={form.shift_start} onChange={(e) => setForm({ ...form, shift_start: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Shift End</Label>
                  <Input type="datetime-local" value={form.shift_end} onChange={(e) => setForm({ ...form, shift_end: e.target.value })} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
              </div>
              <Button type="submit" className="w-full">Create Shift</Button>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-6">
        {/* Week Navigation */}
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => setSelectedDate(new Date(selectedDate.setDate(selectedDate.getDate() - 7)))}>
            Previous Week
          </Button>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">
              {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
            </span>
          </div>
          <Button variant="outline" onClick={() => setSelectedDate(new Date(selectedDate.setDate(selectedDate.getDate() + 7)))}>
            Next Week
          </Button>
        </div>

        {/* Week Grid */}
        <div className="grid grid-cols-7 gap-4">
          {weekDays.map((day) => {
            const dayShifts = getShiftsForDay(day);
            const isToday = isSameDay(day, new Date());
            
            return (
              <Card key={day.toISOString()} className={isToday ? "border-primary" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    <span className={isToday ? "text-primary" : "text-muted-foreground"}>{format(day, "EEE")}</span>
                    <br />
                    <span className={isToday ? "text-primary font-bold" : ""}>{format(day, "d")}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {isLoading ? (
                    <div className="h-16 animate-pulse bg-muted rounded" />
                  ) : dayShifts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No shifts</p>
                  ) : (
                    dayShifts.map((shift) => (
                      <div key={shift.id} className="p-2 rounded bg-primary/10 border border-primary/20 text-xs space-y-1">
                        <div className="flex justify-between items-start">
                          <span className="font-medium">{shift.staff?.first_name} {shift.staff?.last_name}</span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-5 w-5 text-destructive hover:text-destructive"
                            onClick={() => deleteShift.mutate(shift.id)}
                            disabled={deleteShift.isPending}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {format(parseISO(shift.shift_start), "HH:mm")} - {format(parseISO(shift.shift_end), "HH:mm")}
                        </div>
                        <p className="text-muted-foreground truncate">{shift.locations?.name}</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </PageLayout>
  );
}
