import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDateRange, DatePreset } from "@/contexts/DateRangeContext";
import { cn } from "@/lib/utils";

const presetOptions: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

export function DateRangeSelector() {
  const { preset, startDate, endDate, setPreset, setCustomRange, presetLabel } = useDateRange();
  const [customOpen, setCustomOpen] = useState(false);
  const [tempStart, setTempStart] = useState<Date | undefined>(new Date(startDate));
  const [tempEnd, setTempEnd] = useState<Date | undefined>(new Date(endDate));

  const handlePresetSelect = (selectedPreset: DatePreset) => {
    if (selectedPreset === 'custom') {
      setTempStart(new Date(startDate));
      setTempEnd(new Date(endDate));
      setCustomOpen(true);
    } else {
      setPreset(selectedPreset);
    }
  };

  const handleCustomApply = () => {
    if (tempStart && tempEnd) {
      setCustomRange(
        format(tempStart, 'yyyy-MM-dd'),
        format(tempEnd, 'yyyy-MM-dd')
      );
      setCustomOpen(false);
    }
  };

  const getDisplayLabel = () => {
    if (preset === 'custom') {
      return `${format(new Date(startDate), 'MMM d')} - ${format(new Date(endDate), 'MMM d')}`;
    }
    return presetLabel;
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">{getDisplayLabel()}</span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40 z-50">
          {presetOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => handlePresetSelect(option.value)}
              className={cn(preset === option.value && "bg-accent")}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handlePresetSelect('custom')}>
            Custom range...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Badge variant="outline" className="text-xs whitespace-nowrap hidden md:flex">
        Range: {getDisplayLabel()}
      </Badge>

      {/* Custom date picker popover */}
      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverTrigger asChild>
          <span className="hidden" />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4 z-50" align="end">
          <div className="space-y-4">
            <div className="text-sm font-medium">Select date range</div>
            <div className="flex gap-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Start</label>
                <Calendar
                  mode="single"
                  selected={tempStart}
                  onSelect={setTempStart}
                  className="rounded-md border pointer-events-auto"
                  disabled={(date) => date > new Date()}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">End</label>
                <Calendar
                  mode="single"
                  selected={tempEnd}
                  onSelect={setTempEnd}
                  className="rounded-md border pointer-events-auto"
                  disabled={(date) => date > new Date() || (tempStart && date < tempStart)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCustomOpen(false)}>
                Cancel
              </Button>
              <Button 
                size="sm" 
                onClick={handleCustomApply}
                disabled={!tempStart || !tempEnd}
              >
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
