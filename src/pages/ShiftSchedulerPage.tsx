import { useState, useMemo } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, Clock, Trash2, Wand2, Check, X, Edit2 } from "lucide-react";
import { 
  useStaffShifts, 
  useStaffWithContracts, 
  useCreateShift, 
  useDeleteShift,
  useUpdateShift,
  useGenerateDraftRoster,
  useConfirmDraftRoster,
  useDiscardDraftRoster,
  StaffShift 
} from "@/hooks/useShifts";
import { useLocations } from "@/hooks/useLocations";
import { StaffWeeklyHoursSummary } from "@/components/shifts/StaffWeeklyHoursSummary";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, parseISO, isSameDay } from "date-fns";

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
  const [form, setForm] = useState({
    staff_id: "",
    location_id: "",
    shift_start: "",
    shift_end: "",
    notes: "",
  });

  // Count draft shifts for this week
  const draftShiftsCount = useMemo(() => {
    return shifts.filter(s => s.is_draft).length;
  }, [shifts]);

  const hasDrafts = draftShiftsCount > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingShift) {
      await updateShift.mutateAsync({ id: editingShift.id, ...form });
    } else {
      await createShift.mutateAsync(form);
    }
    setOpen(false);
    setEditingShift(null);
    setForm({ staff_id: "", location_id: "", shift_start: "", shift_end: "", notes: "" });
  };

  const handleEdit = (shift: StaffShift) => {
    setEditingShift(shift);
    setForm({
      staff_id: shift.staff_id,
      location_id: shift.location_id,
      shift_start: format(parseISO(shift.shift_start), "yyyy-MM-dd'T'HH:mm"),
      shift_end: format(parseISO(shift.shift_end), "yyyy-MM-dd'T'HH:mm"),
      notes: shift.notes || "",
    });
    setOpen(true);
  };

  const handleDialogClose = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setEditingShift(null);
      setForm({ staff_id: "", location_id: "", shift_start: "", shift_end: "", notes: "" });
    }
  };

  const handleGenerateDraft = async () => {
    if (!selectedLocation) {
      return;
    }
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

  const getShiftsForDay = (day: Date) => {
    return shifts.filter((shift) => isSameDay(parseISO(shift.shift_start), day));
  };

  const navigateWeek = (direction: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + (direction * 7));
    setSelectedDate(newDate);
  };

  return (
    <PageLayout
      title="Shift Scheduler"
      description="Plan and manage staff schedules"
      action={
        <Dialog open={open} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Add Shift</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingShift ? "Edit Shift" : "Create New Shift"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Staff Member</Label>
                <Select value={form.staff_id} onValueChange={(v) => setForm({ ...form, staff_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.first_name} {s.last_name}
                        <span className="ml-2 text-muted-foreground text-xs">
                          ({s.contract_type.replace("_", " ")}, max {s.max_hours_per_week}h/wk)
                        </span>
                      </SelectItem>
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
              <Button type="submit" className="w-full" disabled={createShift.isPending || updateShift.isPending}>
                {editingShift ? "Update Shift" : "Create Shift"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-6">
        {/* Staff Weekly Hours Summary */}
        <StaffWeeklyHoursSummary 
          shifts={shifts} 
          staff={staff} 
          selectedLocation={selectedLocation} 
        />

        {/* Draft Roster Controls */}
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wand2 className="h-4 w-4" />
              Draft Roster Generator
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Location:</Label>
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="outline"
                onClick={handleGenerateDraft}
                disabled={!selectedLocation || generateDraft.isPending || hasDrafts}
              >
                <Wand2 className="mr-2 h-4 w-4" />
                Generate Draft Roster
              </Button>

              {hasDrafts && (
                <>
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                    {draftShiftsCount} Draft Shifts
                  </Badge>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleConfirmDraft}
                    disabled={confirmDraft.isPending || !selectedLocation}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    Confirm Draft
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDiscardDraft}
                    disabled={discardDraft.isPending || !selectedLocation}
                  >
                    <X className="mr-1 h-4 w-4" />
                    Discard Draft
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Week Navigation */}
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => navigateWeek(-1)}>
            Previous Week
          </Button>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">
              {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
            </span>
          </div>
          <Button variant="outline" onClick={() => navigateWeek(1)}>
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
                      <div 
                        key={shift.id} 
                        className={`p-2 rounded border text-xs space-y-1 ${
                          shift.is_draft 
                            ? "bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700" 
                            : "bg-primary/10 border-primary/20"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-1">
                          <div className="flex-1 min-w-0">
                            {shift.is_draft && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 mb-1 bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">
                                DRAFT
                              </Badge>
                            )}
                            <div className="font-medium truncate">{shift.staff?.first_name} {shift.staff?.last_name}</div>
                          </div>
                          <div className="flex gap-0.5 shrink-0">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-5 w-5 text-muted-foreground hover:text-foreground"
                              onClick={() => handleEdit(shift)}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
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
