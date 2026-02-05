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
import { format, startOfWeek, endOfWeek, eachDayOfInterval, parseISO, isSameDay, differenceInMinutes } from "date-fns";
import { formatCurrency } from "@/lib/currency";

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
      title="Timesheets"
      description="Schedule and manage staff shifts — the source of truth for labour hours"
      action={
        <Dialog open={open} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Shift</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingShift ? "Edit Shift" : "Create New Shift"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Staff Member</Label>
                <Select value={form.staff_id} onValueChange={(v) => setForm({ ...form, staff_id: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select staff" /></SelectTrigger>
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
              <div className="space-y-1.5">
                <Label className="text-xs">Location</Label>
                <Select value={form.location_id} onValueChange={(v) => setForm({ ...form, location_id: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select location" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Shift Start</Label>
                  <Input type="datetime-local" className="h-9" value={form.shift_start} onChange={(e) => setForm({ ...form, shift_start: e.target.value })} required autoFocus />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Shift End</Label>
                  <Input type="datetime-local" className="h-9" value={form.shift_end} onChange={(e) => setForm({ ...form, shift_end: e.target.value })} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Input className="h-9" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
              </div>
              <Button type="submit" className="w-full h-9" disabled={createShift.isPending || updateShift.isPending}>
                {editingShift ? "Update Shift" : "Create Shift"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-4">
        {/* Staff Weekly Hours Summary */}
        <StaffWeeklyHoursSummary 
          shifts={shifts} 
          staff={staff} 
          selectedLocation={selectedLocation} 
        />

        {/* Draft Roster Controls */}
        <Card className="border-dashed">
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger className="w-[180px] h-8 text-sm">
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
                size="sm"
                onClick={handleGenerateDraft}
                disabled={!selectedLocation || generateDraft.isPending || hasDrafts}
              >
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                Generate Draft
              </Button>

              {hasDrafts && (
                <>
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
                    {draftShiftsCount} Draft
                  </Badge>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleConfirmDraft}
                    disabled={confirmDraft.isPending || !selectedLocation}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" />
                    Confirm
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDiscardDraft}
                    disabled={discardDraft.isPending || !selectedLocation}
                  >
                    <X className="mr-1 h-3.5 w-3.5" />
                    Discard
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Week Navigation */}
        <div className="flex items-center justify-between py-2">
          <Button variant="ghost" size="sm" onClick={() => navigateWeek(-1)}>
            Previous Week
          </Button>
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigateWeek(1)}>
            Next Week
          </Button>
        </div>

        {/* Week Grid */}
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const dayShifts = getShiftsForDay(day);
            const isToday = isSameDay(day, new Date());
            const dayHours = dayShifts.reduce((sum, s) => {
              const start = parseISO(s.shift_start);
              const end = parseISO(s.shift_end);
              return sum + differenceInMinutes(end, start) / 60;
            }, 0);
            const dayCost = dayShifts.reduce((sum, s) => {
              const staffMember = staff.find(st => st.id === s.staff_id);
              const start = parseISO(s.shift_start);
              const end = parseISO(s.shift_end);
              const hours = differenceInMinutes(end, start) / 60;
              return sum + hours * (staffMember?.hourly_rate || 0);
            }, 0);
            
            return (
              <Card key={day.toISOString()} className={`${isToday ? "border-primary ring-1 ring-primary/20" : ""}`}>
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
                    <p className="text-[10px] text-muted-foreground py-2">No shifts</p>
                  ) : (
                    dayShifts.map((shift) => (
                      <div 
                        key={shift.id} 
                        className={`p-1.5 rounded border text-xs ${
                          shift.is_draft 
                            ? "bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700" 
                            : "bg-primary/5 border-primary/20"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-1">
                          <div className="flex-1 min-w-0">
                            {shift.is_draft && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 mb-0.5 bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">
                                DRAFT
                              </Badge>
                            )}
                            <div className="font-medium text-[11px] truncate">{shift.staff?.first_name} {shift.staff?.last_name}</div>
                          </div>
                          <div className="flex gap-0.5 shrink-0">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-secondary"
                              onClick={() => handleEdit(shift)}
                            >
                              <Edit2 className="h-2.5 w-2.5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-5 w-5 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                              onClick={() => deleteShift.mutate(shift.id)}
                              disabled={deleteShift.isPending}
                            >
                              <Trash2 className="h-2.5 w-2.5" />
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
      </div>
    </PageLayout>
  );
}
