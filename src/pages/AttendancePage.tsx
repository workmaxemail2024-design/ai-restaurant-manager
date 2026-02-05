import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, LogIn, LogOut } from "lucide-react";
import { useStaff, useStaffAttendance, useClockIn, useClockOut, StaffAttendance } from "@/hooks/useStaff";
import { useLocations } from "@/hooks/useLocations";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { Badge } from "@/components/ui/badge";

export default function AttendancePage() {
  const { data: staff = [] } = useStaff();
  const { data: locations = [] } = useLocations();
  const { data: attendance = [], isLoading } = useStaffAttendance();
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

  // Find active clock-ins (no clock_out)
  const activeSessions = attendance.filter(a => !a.clock_out);

  const columns = [
    { 
      key: "staff", 
      header: "Staff Member",
      render: (item: StaffAttendance) => `${item.staff?.first_name} ${item.staff?.last_name}`
    },
    { 
      key: "location", 
      header: "Location",
      render: (item: StaffAttendance) => item.locations?.name || "-"
    },
    { 
      key: "clock_in", 
      header: "Clock In",
      render: (item: StaffAttendance) => format(parseISO(item.clock_in), "MMM d, HH:mm")
    },
    { 
      key: "clock_out", 
      header: "Clock Out",
      render: (item: StaffAttendance) => item.clock_out ? format(parseISO(item.clock_out), "MMM d, HH:mm") : (
        <Badge variant="outline" className="text-primary">Active</Badge>
      )
    },
    { 
      key: "duration", 
      header: "Duration",
      render: (item: StaffAttendance) => {
        if (!item.clock_out) return "-";
        const mins = differenceInMinutes(parseISO(item.clock_out), parseISO(item.clock_in));
        const hours = Math.floor(mins / 60);
        const minutes = mins % 60;
        return `${hours}h ${minutes}m`;
      }
    },
    { 
      key: "source", 
      header: "Source",
      render: (item: StaffAttendance) => (
        <Badge variant="secondary" className="capitalize">{item.source}</Badge>
      )
    },
    {
      key: "actions",
      header: "",
      render: (item: StaffAttendance) => !item.clock_out && (
        <Button size="sm" variant="outline" onClick={() => clockOut.mutate(item.id)} disabled={clockOut.isPending}>
          <LogOut className="mr-2 h-4 w-4" /> Clock Out
        </Button>
      )
    }
  ];

  return (
    <PageLayout
      title="Attendance"
      description="Track staff clock-in and clock-out times"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><LogIn className="mr-2 h-4 w-4" /> Clock In</Button>
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
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Since {format(parseISO(session.clock_in), "HH:mm")}
                    </p>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="mt-2 w-full h-7 text-xs"
                      onClick={() => clockOut.mutate(session.id)}
                      disabled={clockOut.isPending}
                    >
                      <LogOut className="mr-1 h-3 w-3" /> Clock Out
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Attendance History */}
        <DataTable
          data={attendance}
          columns={columns}
          isLoading={isLoading}
        />
      </div>
    </PageLayout>
  );
}
