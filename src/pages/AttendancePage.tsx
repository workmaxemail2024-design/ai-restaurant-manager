import { useState, useMemo } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, LogIn, LogOut, AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import { useStaff, useStaffAttendance, useClockIn, useClockOut, StaffAttendance } from "@/hooks/useStaff";
import { useStaffShifts } from "@/hooks/useShifts";
import { useLocations } from "@/hooks/useLocations";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useLocation } from "@/contexts/LocationContext";
import { LabourEvidenceCard } from "@/components/dashboard/LabourEvidenceCard";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

const LONG_SHIFT_THRESHOLD = 10; // hours
const VARIANCE_THRESHOLD = 2; // hours difference to flag

export default function AttendancePage() {
  const { data: staff = [] } = useStaff();
  const { data: locations = [] } = useLocations();
  const { startDate, endDate, queryStartDate, queryEndDate, presetLabel } = useDateRange();
  const { selectedLocationId } = useLocation();
  
  const { data: attendance = [], isLoading } = useStaffAttendance(queryStartDate, queryEndDate, selectedLocationId);
  const { data: shifts = [] } = useStaffShifts(queryStartDate, queryEndDate);
  const clockIn = useClockIn();
  const clockOut = useClockOut();

  const [open, setOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");

  const handleClockIn = async () => {
    if (!selectedStaff || !selectedLocation) return;
    await clockIn.mutateAsync({ staff_id: selectedStaff, location_id: selectedLocation, source: "manual" });
    setOpen(false);
    setSelectedStaff("");
    setSelectedLocation("");
  };

  const activeSessions = attendance.filter(a => !a.clock_out);

  // Compute summaries
  const summary = useMemo(() => {
    let totalActualHours = 0;
    let totalActualCost = 0;
    let totalPlannedHours = 0;
    let totalPlannedCost = 0;
    let missingClockOut = 0;
    let longShifts = 0;

    const staffRateMap = new Map<string, number>();
    staff.forEach(s => staffRateMap.set(s.id, s.hourly_rate));

    // Actual from attendance
    attendance.forEach(a => {
      if (!a.clock_out) {
        missingClockOut++;
        return;
      }
      const mins = differenceInMinutes(parseISO(a.clock_out), parseISO(a.clock_in));
      const hours = mins / 60;
      totalActualHours += hours;
      const rate = staffRateMap.get(a.staff_id) || 0;
      totalActualCost += hours * rate;
      if (hours > LONG_SHIFT_THRESHOLD) longShifts++;
    });

    // Planned from shifts
    const filteredShifts = selectedLocationId
      ? shifts.filter(s => s.location_id === selectedLocationId)
      : shifts;
    filteredShifts.forEach(s => {
      const mins = differenceInMinutes(parseISO(s.shift_end), parseISO(s.shift_start));
      const hours = mins / 60;
      totalPlannedHours += hours;
      const rate = staffRateMap.get(s.staff_id) || 0;
      totalPlannedCost += hours * rate;
    });

    const hoursVariance = totalActualHours - totalPlannedHours;
    const costVariance = totalActualCost - totalPlannedCost;

    return {
      totalActualHours, totalActualCost,
      totalPlannedHours, totalPlannedCost,
      hoursVariance, costVariance,
      missingClockOut, longShifts,
    };
  }, [attendance, shifts, staff, selectedLocationId]);

  // Match attendance to planned shift for variance per entry
  const getAttendanceVariance = (a: StaffAttendance): { plannedHours: number | null; varianceHours: number | null } => {
    if (!a.clock_out) return { plannedHours: null, varianceHours: null };
    const actualMins = differenceInMinutes(parseISO(a.clock_out), parseISO(a.clock_in));
    const actualHours = actualMins / 60;
    const clockInDate = format(parseISO(a.clock_in), "yyyy-MM-dd");

    // Find matching shift for same staff on same day
    const matchingShift = shifts.find(s =>
      s.staff_id === a.staff_id &&
      format(parseISO(s.shift_start), "yyyy-MM-dd") === clockInDate
    );

    if (!matchingShift) return { plannedHours: null, varianceHours: null };

    const plannedMins = differenceInMinutes(parseISO(matchingShift.shift_end), parseISO(matchingShift.shift_start));
    const plannedHours = plannedMins / 60;
    return { plannedHours, varianceHours: actualHours - plannedHours };
  };

  const columns = [
    { 
      key: "staff", header: "Staff Member",
      render: (item: StaffAttendance) => (
        <span className="font-medium">{item.staff?.first_name} {item.staff?.last_name}</span>
      )
    },
    { 
      key: "location", header: "Location",
      render: (item: StaffAttendance) => item.locations?.name || "-"
    },
    { 
      key: "clock_in", header: "Clock In",
      render: (item: StaffAttendance) => format(parseISO(item.clock_in), "MMM d, HH:mm")
    },
    { 
      key: "clock_out", header: "Clock Out",
      render: (item: StaffAttendance) => item.clock_out ? format(parseISO(item.clock_out), "MMM d, HH:mm") : (
        <Badge variant="outline" className="text-primary gap-1">
          <Clock className="h-3 w-3" /> Active
        </Badge>
      )
    },
    { 
      key: "duration", header: "Hours",
      render: (item: StaffAttendance) => {
        if (!item.clock_out) return "—";
        const mins = differenceInMinutes(parseISO(item.clock_out), parseISO(item.clock_in));
        const hours = mins / 60;
        const isLong = hours > LONG_SHIFT_THRESHOLD;
        return (
          <span className={cn("font-mono", isLong && "text-warning")}>
            {hours.toFixed(1)}h
            {isLong && <AlertTriangle className="h-3 w-3 inline ml-1" />}
          </span>
        );
      }
    },
    {
      key: "cost", header: "Cost",
      render: (item: StaffAttendance) => {
        if (!item.clock_out) return "—";
        const mins = differenceInMinutes(parseISO(item.clock_out), parseISO(item.clock_in));
        const hours = mins / 60;
        const rate = staff.find(s => s.id === item.staff_id)?.hourly_rate || 0;
        return <span className="font-mono">{formatCurrency(hours * rate)}</span>;
      }
    },
    {
      key: "variance", header: "vs Plan",
      render: (item: StaffAttendance) => {
        const { varianceHours } = getAttendanceVariance(item);
        if (varianceHours === null) return <span className="text-muted-foreground text-xs">No shift</span>;
        const abs = Math.abs(varianceHours);
        if (abs < 0.25) return <span className="text-xs text-muted-foreground">On plan</span>;
        const isOver = varianceHours > 0;
        return (
          <span className={cn("text-xs font-medium flex items-center gap-0.5",
            abs > VARIANCE_THRESHOLD ? "text-destructive" : isOver ? "text-warning" : "text-success"
          )}>
            {isOver ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {isOver ? "+" : ""}{varianceHours.toFixed(1)}h
          </span>
        );
      }
    },
    { 
      key: "source", header: "Source",
      render: (item: StaffAttendance) => (
        <Badge variant="secondary" className="capitalize text-[10px]">{item.source}</Badge>
      )
    },
    {
      key: "actions", header: "",
      render: (item: StaffAttendance) => !item.clock_out && (
        <Button size="sm" variant="outline" onClick={() => clockOut.mutate(item.id)} disabled={clockOut.isPending}>
          <LogOut className="mr-1 h-3 w-3" /> Out
        </Button>
      )
    }
  ];

  return (
    <PageLayout
      title="Actual Labour / Attendance"
      description="Actual hours worked — imported from Captiva POS where available, or reviewed and entered manually after the day"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <LogIn className="mr-2 h-4 w-4" /> Clock In (optional)
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Clock In Staff</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Staff Member</label>
                <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select staff" /></SelectTrigger>
                  <SelectContent>
                    {staff.filter(s => s.status === "active").map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Location</label>
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select location" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleClockIn} className="w-full h-9" disabled={!selectedStaff || !selectedLocation}>
                <LogIn className="mr-2 h-4 w-4" /> Clock In Now
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-4">
        <LabourEvidenceCard date={startDate} locationId={selectedLocationId ?? null} />

        {/* Planned vs Actual Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Actual Hours</p>
              <p className="text-xl font-bold">{summary.totalActualHours.toFixed(1)}h</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Actual Cost</p>
              <p className="text-xl font-bold">{formatCurrency(summary.totalActualCost)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Planned Hours</p>
              <p className="text-xl font-bold text-muted-foreground">{summary.totalPlannedHours.toFixed(1)}h</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Planned Cost</p>
              <p className="text-xl font-bold text-muted-foreground">{formatCurrency(summary.totalPlannedCost)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Hours Variance</p>
              <p className={cn("text-xl font-bold",
                Math.abs(summary.hoursVariance) < 1 ? "text-muted-foreground"
                  : summary.hoursVariance > 0 ? "text-destructive" : "text-success"
              )}>
                {summary.hoursVariance > 0 ? "+" : ""}{summary.hoursVariance.toFixed(1)}h
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Cost Variance</p>
              <p className={cn("text-xl font-bold",
                Math.abs(summary.costVariance) < 10 ? "text-muted-foreground"
                  : summary.costVariance > 0 ? "text-destructive" : "text-success"
              )}>
                {summary.costVariance > 0 ? "+" : ""}{formatCurrency(summary.costVariance)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Warnings */}
        {(summary.missingClockOut > 0 || summary.longShifts > 0) && (
          <div className="flex flex-wrap gap-2">
            {summary.missingClockOut > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {summary.missingClockOut} missing clock-out{summary.missingClockOut > 1 ? "s" : ""}
              </Badge>
            )}
            {summary.longShifts > 0 && (
              <Badge variant="secondary" className="gap-1 text-warning">
                <Clock className="h-3 w-3" />
                {summary.longShifts} shift{summary.longShifts > 1 ? "s" : ""} over {LONG_SHIFT_THRESHOLD}h
              </Badge>
            )}
          </div>
        )}

        {/* Period info */}
        <div className="text-sm text-muted-foreground">
          Showing: <span className="font-medium text-foreground">{presetLabel}</span>
          {startDate !== endDate && <span> ({startDate} → {endDate})</span>}
        </div>

        {/* Active Sessions */}
        {activeSessions.length > 0 && (
          <Card className="border-primary/50 bg-primary/5">
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4 text-primary" />
                Currently Working ({activeSessions.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {activeSessions.map((session) => (
                  <div key={session.id} className="p-2.5 rounded-lg bg-background border text-sm">
                    <p className="font-medium truncate">{session.staff?.first_name} {session.staff?.last_name}</p>
                    <p className="text-xs text-muted-foreground">{session.locations?.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Since {format(parseISO(session.clock_in), "HH:mm")}</p>
                    <Button size="sm" variant="outline" className="mt-2 w-full h-7 text-xs"
                      onClick={() => clockOut.mutate(session.id)} disabled={clockOut.isPending}>
                      <LogOut className="mr-1 h-3 w-3" /> Clock Out
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Attendance History */}
        {!isLoading && attendance.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center space-y-1">
              <p className="text-sm font-semibold">No attendance imported yet</p>
              <p className="text-sm text-muted-foreground">
                Actual labour normally comes from Captiva POS. If it hasn't arrived, review the day
                from the Daily Control Centre to enter total or per-staff hours and confirm labour.
                Clock In here is optional.
              </p>
            </CardContent>
          </Card>
        ) : (
          <DataTable data={attendance} columns={columns} isLoading={isLoading} />
        )}

      </div>
    </PageLayout>
  );
}
