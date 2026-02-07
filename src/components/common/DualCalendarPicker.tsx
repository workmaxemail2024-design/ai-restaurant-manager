import { useState } from "react";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface DualCalendarPickerProps {
  startDate: Date | undefined;
  endDate: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
  disabled?: (date: Date) => boolean;
  className?: string;
}

/**
 * A responsive dual calendar picker for selecting date ranges.
 * 
 * Features:
 * - Side-by-side calendars on desktop (grid-cols-2)
 * - Stacked single calendars on mobile
 * - Automatic constraint: end date cannot be before start date
 * - Visual summary of selected dates
 */
export function DualCalendarPicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  disabled,
  className,
}: DualCalendarPickerProps) {
  const isMobile = useIsMobile();
  
  // On mobile, show a tabbed view instead of both calendars
  const [activeCalendar, setActiveCalendar] = useState<"start" | "end">("start");

  const startDisabled = disabled || ((date: Date) => date > new Date());
  const endDisabled = (date: Date) => {
    if (disabled?.(date)) return true;
    if (date > new Date()) return true;
    if (startDate && date < startDate) return true;
    return false;
  };

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

        {/* Single calendar view */}
        <div className="flex justify-center">
          <Calendar
            mode="single"
            selected={activeCalendar === "start" ? startDate : endDate}
            onSelect={activeCalendar === "start" ? onStartDateChange : onEndDateChange}
            disabled={activeCalendar === "start" ? startDisabled : endDisabled}
            className="rounded-md border pointer-events-auto"
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Start Date</Label>
          <Calendar
            mode="single"
            selected={startDate}
            onSelect={onStartDateChange}
            disabled={startDisabled}
            className="rounded-md border pointer-events-auto"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">End Date</Label>
          <Calendar
            mode="single"
            selected={endDate}
            onSelect={onEndDateChange}
            disabled={endDisabled}
            className="rounded-md border pointer-events-auto"
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
