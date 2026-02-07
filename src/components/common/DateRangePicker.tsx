import { useState, useEffect } from "react";
import { CalendarDays, Check } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfYear } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { DateRange, DayContentProps } from "react-day-picker";
import { useCalendarDataDays } from "@/hooks/useCalendarDataDays";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocation } from "@/contexts/LocationContext";

export type DatePreset = 
  | 'today' 
  | 'yesterday' 
  | '7d' 
  | '30d' 
  | 'this_month' 
  | 'last_month' 
  | 'ytd' 
  | 'custom';

interface PresetOption {
  value: DatePreset;
  label: string;
  getRange: () => { from: Date; to: Date };
}

const presets: PresetOption[] = [
  {
    value: 'today',
    label: 'Today',
    getRange: () => ({ from: new Date(), to: new Date() })
  },
  {
    value: 'yesterday',
    label: 'Yesterday',
    getRange: () => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) })
  },
  {
    value: '7d',
    label: 'Last 7 days',
    getRange: () => ({ from: subDays(new Date(), 6), to: new Date() })
  },
  {
    value: '30d',
    label: 'Last 30 days',
    getRange: () => ({ from: subDays(new Date(), 29), to: new Date() })
  },
  {
    value: 'this_month',
    label: 'This month',
    getRange: () => ({ from: startOfMonth(new Date()), to: new Date() })
  },
  {
    value: 'last_month',
    label: 'Last month',
    getRange: () => {
      const lastMonth = subMonths(new Date(), 1);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
    }
  },
  {
    value: 'ytd',
    label: 'Year to date',
    getRange: () => ({ from: startOfYear(new Date()), to: new Date() })
  },
];

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  preset: DatePreset;
  onApply: (startDate: string, endDate: string, preset: DatePreset) => void;
  className?: string;
}

export function DateRangePicker({
  startDate,
  endDate,
  preset,
  onApply,
  className
}: DateRangePickerProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>(preset);
  const [tempRange, setTempRange] = useState<DateRange | undefined>({
    from: new Date(startDate),
    to: new Date(endDate)
  });
  const [visibleMonth, setVisibleMonth] = useState<Date>(new Date(startDate));
  
  // Get restaurant and location for data days hook
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();

  // Fetch data days only when picker is open (lazy load)
  const { data: dataDays } = useCalendarDataDays({
    visibleMonth,
    restaurantId: currentRestaurant?.id ?? null,
    locationId: selectedLocationId,
    enabled: open
  });


  // Sync temp state when external props change
  useEffect(() => {
    setSelectedPreset(preset);
    setTempRange({
      from: new Date(startDate),
      to: new Date(endDate)
    });
  }, [startDate, endDate, preset]);

  const handlePresetClick = (presetOption: PresetOption) => {
    const range = presetOption.getRange();
    setSelectedPreset(presetOption.value);
    setTempRange({ from: range.from, to: range.to });
  };

  const handleRangeSelect = (range: DateRange | undefined) => {
    setTempRange(range);
    if (range?.from && range?.to) {
      setSelectedPreset('custom');
    }
  };

  const handleMonthChange = (month: Date) => {
    setVisibleMonth(month);
  };

  const handleApply = () => {
    if (tempRange?.from) {
      const fromDate = format(tempRange.from, 'yyyy-MM-dd');
      const toDate = format(tempRange.to || tempRange.from, 'yyyy-MM-dd');
      onApply(fromDate, toDate, selectedPreset);
      setOpen(false);
    }
  };

  const handleCancel = () => {
    setSelectedPreset(preset);
    setTempRange({
      from: new Date(startDate),
      to: new Date(endDate)
    });
    setOpen(false);
  };

  const getDisplayLabel = () => {
    const fromDate = new Date(startDate);
    const toDate = new Date(endDate);
    
    if (startDate === endDate) {
      return format(fromDate, 'MMM d, yyyy');
    }
    
    const fromYear = fromDate.getFullYear();
    const toYear = toDate.getFullYear();
    const currentYear = new Date().getFullYear();
    
    if (fromYear === toYear && fromYear === currentYear) {
      return `${format(fromDate, 'MMM d')} → ${format(toDate, 'MMM d')}`;
    }
    
    return `${format(fromDate, 'MMM d, yyyy')} → ${format(toDate, 'MMM d, yyyy')}`;
  };

  const triggerButton = (
    <Button
      variant="outline"
      size="sm"
      className={cn("h-9 gap-2 min-w-[140px] justify-start", className)}
      onClick={() => setOpen(true)}
    >
      <CalendarDays className="h-4 w-4 shrink-0" />
      <span className="truncate">{getDisplayLabel()}</span>
    </Button>
  );

  const pickerContent = (
    <div className="flex flex-col sm:flex-row gap-4">
      {/* Presets sidebar */}
      <div className="flex sm:flex-col gap-1 overflow-x-auto sm:overflow-visible pb-2 sm:pb-0 sm:border-r sm:pr-4 sm:min-w-[140px]">
        {presets.map((presetOption) => (
          <Button
            key={presetOption.value}
            variant={selectedPreset === presetOption.value ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "justify-start h-8 text-sm whitespace-nowrap",
              selectedPreset === presetOption.value && "bg-secondary"
            )}
            onClick={() => handlePresetClick(presetOption)}
          >
            {selectedPreset === presetOption.value && (
              <Check className="h-3 w-3 mr-2 shrink-0" />
            )}
            {presetOption.label}
          </Button>
        ))}
      </div>

      {/* Calendar */}
      <div className="flex flex-col items-center">
        <Calendar
          mode="range"
          selected={tempRange}
          onSelect={handleRangeSelect}
          onMonthChange={handleMonthChange}
          numberOfMonths={isMobile ? 1 : 2}
          disabled={(date) => date > new Date()}
          className="rounded-md border pointer-events-auto"
          showOutsideDays={false}
          components={{
            DayContent: ({ date, ...props }: DayContentProps) => {
              const dateStr = format(date, 'yyyy-MM-dd');
              const hasData = dataDays?.has(dateStr) ?? false;
              return (
                <div className="relative w-full h-full flex items-center justify-center">
                  <span>{date.getDate()}</span>
                  {hasData && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                  )}
                </div>
              );
            }
          }}
        />
        <p className="text-xs text-muted-foreground mt-2">
          {tempRange?.from && tempRange?.to ? (
            <>
              {format(tempRange.from, 'MMM d, yyyy')}
              {tempRange.from.getTime() !== tempRange.to.getTime() && (
                <> → {format(tempRange.to, 'MMM d, yyyy')}</>
              )}
            </>
          ) : tempRange?.from ? (
            <>Select end date</>
          ) : (
            <>Select start date</>
          )}
        </p>
      </div>
    </div>
  );

  const footerContent = (
    <div className="flex justify-end gap-2 pt-4 border-t">
      <Button variant="outline" size="sm" onClick={handleCancel}>
        Cancel
      </Button>
      <Button size="sm" onClick={handleApply} disabled={!tempRange?.from}>
        Apply
      </Button>
    </div>
  );

  // Use Dialog on mobile, Popover on desktop
  if (isMobile) {
    return (
      <>
        {triggerButton}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-fit max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Select Date Range</DialogTitle>
            </DialogHeader>
            {pickerContent}
            <DialogFooter className="mt-4">
              {footerContent}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {triggerButton}
      </PopoverTrigger>
      <PopoverContent 
        className="w-auto p-4 z-[100]" 
        align="end"
        side="bottom"
        sideOffset={8}
        collisionPadding={16}
        avoidCollisions
      >
        {pickerContent}
        {footerContent}
      </PopoverContent>
    </Popover>
  );
}
