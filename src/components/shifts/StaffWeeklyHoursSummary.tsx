import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";
import { differenceInMinutes, parseISO } from "date-fns";
import type { StaffShift, StaffWithContract } from "@/hooks/useShifts";

interface StaffWeeklyHoursSummaryProps {
  shifts: StaffShift[];
  staff: StaffWithContract[];
  selectedLocation: string;
}

interface StaffHoursSummary {
  staffId: string;
  name: string;
  scheduledHours: number;
  contractedHours: number;
  minHours: number | null;
  status: "ok" | "under" | "over";
}

export function StaffWeeklyHoursSummary({ shifts, staff, selectedLocation }: StaffWeeklyHoursSummaryProps) {
  const summaries = useMemo(() => {
    // Filter shifts by selected location if one is chosen
    const filteredShifts = selectedLocation 
      ? shifts.filter(s => s.location_id === selectedLocation)
      : shifts;

    // Build a map of staff id to total hours
    const hoursMap: Record<string, number> = {};
    
    filteredShifts.forEach(shift => {
      const start = parseISO(shift.shift_start);
      const end = parseISO(shift.shift_end);
      const minutes = differenceInMinutes(end, start);
      const hours = minutes / 60;
      
      hoursMap[shift.staff_id] = (hoursMap[shift.staff_id] || 0) + hours;
    });

    // Get unique staff IDs from shifts
    const staffIdsWithShifts = new Set(filteredShifts.map(s => s.staff_id));
    
    // Build summaries for staff who have shifts this week
    const results: StaffHoursSummary[] = [];
    
    staffIdsWithShifts.forEach(staffId => {
      const staffMember = staff.find(s => s.id === staffId);
      if (!staffMember) return;

      const scheduledHours = hoursMap[staffId] || 0;
      const contractedHours = staffMember.max_hours_per_week;
      const minHours = staffMember.min_hours_per_week;

      let status: "ok" | "under" | "over" = "ok";
      
      if (scheduledHours > contractedHours) {
        status = "over";
      } else if (minHours && scheduledHours < minHours) {
        status = "under";
      }

      results.push({
        staffId,
        name: `${staffMember.first_name} ${staffMember.last_name}`,
        scheduledHours: Math.round(scheduledHours * 10) / 10,
        contractedHours,
        minHours,
        status,
      });
    });

    // Sort by name
    results.sort((a, b) => a.name.localeCompare(b.name));

    return results;
  }, [shifts, staff, selectedLocation]);

  if (summaries.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Staff Weekly Hours Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {summaries.map(summary => (
            <Badge
              key={summary.staffId}
              variant="outline"
              className={`
                px-3 py-1.5 text-sm font-medium
                ${summary.status === "ok" 
                  ? "bg-green-50 border-green-300 text-green-800 dark:bg-green-900/20 dark:border-green-700 dark:text-green-400" 
                  : summary.status === "over"
                  ? "bg-red-50 border-red-300 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400"
                  : "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-400"
                }
              `}
            >
              {summary.name} — {summary.scheduledHours} / {summary.contractedHours}h
              {summary.status === "ok" && " ✓"}
              {summary.status === "over" && " ⚠️ over"}
              {summary.status === "under" && " ⚠️ under"}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
