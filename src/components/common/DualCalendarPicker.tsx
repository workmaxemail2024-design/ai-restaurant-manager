import { useState } from "react";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { DayContentProps } from "react-day-picker";
import { usePOSDateCoverage, DateCoverageMap } from "@/hooks/usePOSDateCoverage";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DualCalendarPickerProps {
  startDate: Date | undefined;
  endDate: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
  disabled?: (date: Date) => boolean;
  className?: string;
  // Optional: POS coverage data
  locationId?: string | null;
  posProvider?: string;
  showCoverageMarkers?: boolean;
}

/**
 * A responsive dual calendar picker for selecting date ranges.
 * 
 * Features:
 * - Side-by-side calendars on desktop (grid-cols-2)
 * - Stacked single calendars on mobile
 * - Automatic constraint: end date cannot be before start date
 * - Visual summary of selected dates
 * - Optional POS coverage markers showing imported/applied days
 */
export function DualCalendarPicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  disabled,
  className,
  locationId,
  posProvider,
  showCoverageMarkers = false,
}: DualCalendarPickerProps) {
  const isMobile = useIsMobile();
  
  // On mobile, show a tabbed view instead of both calendars
  const [activeCalendar, setActiveCalendar] = useState<"start" | "end">("start");
  const [visibleMonth, setVisibleMonth] = useState<Date>(startDate || new Date());

  // Fetch coverage data when enabled
  const { data: coverageData } = usePOSDateCoverage({
    locationId: locationId ?? null,
    posProvider: posProvider || '',
    visibleMonth,
    enabled: showCoverageMarkers && !!locationId && !!posProvider,
  });

  const startDisabled = disabled || ((date: Date) => date > new Date());
  const endDisabled = (date: Date) => {
    if (disabled?.(date)) return true;
    if (date > new Date()) return true;
    if (startDate && date < startDate) return true;
    return false;
  };

  // Custom day content renderer with coverage markers
  const createDayContent = (coverageMap?: DateCoverageMap) => {
    return ({ date }: DayContentProps) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const coverage = coverageMap?.get(dateStr);
      const hasImported = coverage?.imported ?? false;
      const hasApplied = coverage?.applied ?? false;

      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative w-full h-full flex items-center justify-center">
                <span>{date.getDate()}</span>
                {(hasImported || hasApplied) && (
                  <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                    {hasApplied ? (
                      // Applied = solid accent dot (represents success/complete)
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    ) : hasImported ? (
                      // Imported but not applied = warning/pending state
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-foreground/60" />
                    ) : null}
                  </div>
                )}
              </div>
            </TooltipTrigger>
            {(hasImported || hasApplied) && (
              <TooltipContent side="top" className="text-xs">
                {hasApplied ? "Imported & Applied" : "Imported (not applied)"}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      );
    };
  };

  const calendarComponents = showCoverageMarkers && coverageData ? {
    DayContent: createDayContent(coverageData)
  } : undefined;

  if (isMobile) {
    return (
      <div className={cn("space-y-4", className)}>
        {/* Mobile tab switcher */}
        <div className="flex gap-2 p-1 bg-muted rounded-lg">
          <button
            type="button"
            className={cn(
              "flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors",
              activeCalendar === "start"
                ? "bg-background shadow-sm"
                : "hover:bg-background/50"
            )}
            onClick={() => setActiveCalendar("start")}
          >
            Start: {startDate ? format(startDate, "MMM d") : "Select"}
          </button>
          <button
            type="button"
            className={cn(
              "flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors",
              activeCalendar === "end"
                ? "bg-background shadow-sm"
                : "hover:bg-background/50"
            )}
            onClick={() => setActiveCalendar("end")}
          >
            End: {endDate ? format(endDate, "MMM d") : "Select"}
          </button>
        </div>

        {/* Legend */}
        {showCoverageMarkers && (
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-accent-foreground/60" />
              <span>Imported</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span>Applied</span>
            </div>
          </div>
        )}

        {/* Single calendar view */}
        <div className="flex justify-center">
          <Calendar
            mode="single"
            selected={activeCalendar === "start" ? startDate : endDate}
            onSelect={activeCalendar === "start" ? onStartDateChange : onEndDateChange}
            disabled={activeCalendar === "start" ? startDisabled : endDisabled}
            onMonthChange={setVisibleMonth}
            className="rounded-md border pointer-events-auto"
            components={calendarComponents}
          />
        </div>

        {/* Summary */}
        {startDate && endDate && (
          <p className="text-center text-sm text-muted-foreground">
            {format(startDate, "MMM d, yyyy")} → {format(endDate, "MMM d, yyyy")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Legend */}
      {showCoverageMarkers && (
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-accent-foreground/60" />
            <span>Imported</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span>Applied</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Start Date</Label>
          <Calendar
            mode="single"
            selected={startDate}
            onSelect={onStartDateChange}
            disabled={startDisabled}
            onMonthChange={setVisibleMonth}
            className="rounded-md border pointer-events-auto"
            components={calendarComponents}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">End Date</Label>
          <Calendar
            mode="single"
            selected={endDate}
            onSelect={onEndDateChange}
            disabled={endDisabled}
            onMonthChange={setVisibleMonth}
            className="rounded-md border pointer-events-auto"
            components={calendarComponents}
          />
        </div>
      </div>

      {/* Summary */}
      {startDate && endDate && (
        <p className="text-center text-sm text-muted-foreground">
          Selected: {format(startDate, "MMM d, yyyy")} → {format(endDate, "MMM d, yyyy")}
        </p>
      )}
    </div>
  );
}
