import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, AlertTriangle, Euro } from "lucide-react";
import { differenceInMinutes, parseISO } from "date-fns";
import { formatCurrency } from "@/lib/currency";
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
  hourlyRate: number;
  wageCost: number;
  overtimeHours: number;
  status: "ok" | "under" | "over" | "overtime";
}

const OVERTIME_THRESHOLD = 2; // Hours over contract before overtime warning

export function StaffWeeklyHoursSummary({ shifts, staff, selectedLocation }: StaffWeeklyHoursSummaryProps) {
  const { summaries, totalWageCost, totalOvertimeHours, hasOvertimeIssues } = useMemo(() => {
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
    let wageCostTotal = 0;
    let overtimeTotal = 0;
    let hasOvertime = false;
    
    staffIdsWithShifts.forEach(staffId => {
      const staffMember = staff.find(s => s.id === staffId);
      if (!staffMember) return;

      const scheduledHours = hoursMap[staffId] || 0;
      const contractedHours = staffMember.max_hours_per_week;
      const minHours = staffMember.min_hours_per_week;
      const hourlyRate = staffMember.hourly_rate || 0;
      const wageCost = scheduledHours * hourlyRate;
      
      // Calculate overtime (hours beyond contract + threshold)
      const overtimeHours = Math.max(0, scheduledHours - contractedHours);
      
      wageCostTotal += wageCost;
      overtimeTotal += overtimeHours;

      let status: "ok" | "under" | "over" | "overtime" = "ok";
      
      if (scheduledHours > contractedHours + OVERTIME_THRESHOLD) {
        status = "overtime";
        hasOvertime = true;
      } else if (scheduledHours > contractedHours) {
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
        hourlyRate,
        wageCost,
        overtimeHours: Math.round(overtimeHours * 10) / 10,
        status,
      });
    });

    // Sort by status priority (overtime first, then over, then under, then ok)
    const statusPriority = { overtime: 0, over: 1, under: 2, ok: 3 };
    results.sort((a, b) => statusPriority[a.status] - statusPriority[b.status] || a.name.localeCompare(b.name));

    return { 
      summaries: results, 
      totalWageCost: wageCostTotal, 
      totalOvertimeHours: Math.round(overtimeTotal * 10) / 10,
      hasOvertimeIssues: hasOvertime 
    };
  }, [shifts, staff, selectedLocation]);

  if (summaries.length === 0) {
    return null;
  }

  const overtimeStaff = summaries.filter(s => s.status === "overtime");

  return (
    <div className="space-y-4">
      {/* Overtime Warning Banner */}
      {hasOvertimeIssues && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">
                  Overtime Warning: {overtimeStaff.length} staff member{overtimeStaff.length > 1 ? 's' : ''} exceed{overtimeStaff.length === 1 ? 's' : ''} contracted hours by more than {OVERTIME_THRESHOLD}h
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {overtimeStaff.map(s => `${s.name} (+${s.overtimeHours}h)`).join(", ")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Summary Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Staff Weekly Hours Summary
            </CardTitle>
            <div className="flex items-center gap-4">
              {totalOvertimeHours > 0 && (
                <Badge variant="outline" className="bg-destructive/10 border-destructive/30 text-destructive">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {totalOvertimeHours}h overtime
                </Badge>
              )}
              <div className="flex items-center gap-1.5 text-sm">
                <Euro className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{formatCurrency(totalWageCost)}</span>
                <span className="text-muted-foreground">weekly wage cost</span>
              </div>
            </div>
          </div>
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
                    : summary.status === "overtime"
                    ? "bg-destructive/10 border-destructive/30 text-destructive dark:bg-destructive/20"
                    : summary.status === "over"
                    ? "bg-red-50 border-red-300 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400"
                    : "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-400"
                  }
                `}
                title={`${summary.name}: ${formatCurrency(summary.wageCost)} (${summary.scheduledHours}h × ${formatCurrency(summary.hourlyRate)}/h)`}
              >
                {summary.name} — {summary.scheduledHours} / {summary.contractedHours}h
                {summary.status === "ok" && " ✓"}
                {summary.status === "overtime" && ` 🚨 +${summary.overtimeHours}h`}
                {summary.status === "over" && ` ⚠️ +${summary.overtimeHours}h`}
                {summary.status === "under" && " ⚠️ under"}
              </Badge>
            ))}
          </div>
          
          {/* Wage Cost Breakdown */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Total Hours</p>
                <p className="font-medium">{summaries.reduce((sum, s) => sum + s.scheduledHours, 0).toFixed(1)}h</p>
              </div>
              <div>
                <p className="text-muted-foreground">Contracted Hours</p>
                <p className="font-medium">{summaries.reduce((sum, s) => sum + s.contractedHours, 0)}h</p>
              </div>
              <div>
                <p className="text-muted-foreground">Overtime Hours</p>
                <p className={`font-medium ${totalOvertimeHours > 0 ? "text-destructive" : ""}`}>
                  {totalOvertimeHours}h
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Weekly Wage Cost</p>
                <p className="font-medium">{formatCurrency(totalWageCost)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
