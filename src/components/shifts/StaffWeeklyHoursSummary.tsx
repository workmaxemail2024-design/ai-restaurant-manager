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
    <div className="space-y-2">
      {/* Overtime Warning Banner */}
      {hasOvertimeIssues && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
              <p className="text-[11px] font-medium text-destructive">
                Overtime: {overtimeStaff.map(s => `${s.name} (+${s.overtimeHours}h)`).join(", ")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Summary Card */}
      <Card>
        <CardContent className="py-2 px-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <Clock className="h-3 w-3 text-muted-foreground" />
              Weekly Hours
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              {totalOvertimeHours > 0 && (
                <span className="text-destructive font-medium">{totalOvertimeHours}h OT</span>
              )}
              <span className="text-muted-foreground">
                <Euro className="h-3 w-3 inline mr-0.5" />
                <span className="font-medium text-foreground">{formatCurrency(totalWageCost)}</span>/wk
              </span>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-1">
            {summaries.map(summary => (
              <Badge
                key={summary.staffId}
                variant="outline"
                className={`
                  px-1.5 py-0.5 text-[10px] font-medium h-5
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
                {summary.name.split(' ')[0]} {summary.scheduledHours}/{summary.contractedHours}h
                {summary.status === "ok" && " ✓"}
                {summary.status !== "ok" && " ⚠"}
              </Badge>
            ))}
          </div>
          
          {/* Compact Wage Cost Breakdown */}
          <div className="flex items-center gap-4 mt-2 pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
            <span>Hours: <span className="text-foreground font-medium">{summaries.reduce((sum, s) => sum + s.scheduledHours, 0).toFixed(1)}h</span></span>
            <span>Contract: <span className="text-foreground font-medium">{summaries.reduce((sum, s) => sum + s.contractedHours, 0)}h</span></span>
            {totalOvertimeHours > 0 && (
              <span>OT: <span className="text-destructive font-medium">{totalOvertimeHours}h</span></span>
            )}
            <span>Cost: <span className="text-foreground font-medium">{formatCurrency(totalWageCost)}</span></span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
