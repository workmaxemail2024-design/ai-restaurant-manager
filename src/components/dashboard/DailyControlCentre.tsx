import { MapPin, CalendarRange } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LocationSelector } from "@/components/LocationSelector";
import { DateRangeSelector } from "@/components/DateRangeSelector";
import { useDateRange, type DatePreset } from "@/contexts/DateRangeContext";
import { useLocation } from "@/contexts/LocationContext";
import { useLocations } from "@/hooks/useLocations";

const QUICK_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "this_month", label: "This month" },
];

/** Human label for the currently selected day or range. */
export function useSelectedPeriodLabel() {
  const { startDate, endDate } = useDateRange();
  const isSingleDay = startDate === endDate;
  const label = isSingleDay
    ? format(parseISO(startDate), "EEE d MMM yyyy")
    : `${format(parseISO(startDate), "d MMM")} → ${format(parseISO(endDate), "d MMM yyyy")}`;
  return { isSingleDay, label, startDate, endDate };
}

export function DailyControlCentre() {
  const { preset, setPreset } = useDateRange();
  const { isSingleDay, label } = useSelectedPeriodLabel();
  const { selectedLocationId } = useLocation();
  const { data: locations = [] } = useLocations();

  const locationName =
    locations.find((l) => l.id === selectedLocationId)?.name ?? "All locations";

  return (
    <Card className="mt-4">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-1 min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Daily Control Centre</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="flex items-center gap-1.5 font-semibold">
                <MapPin className="h-4 w-4 text-primary" />
                {locationName}
              </span>
              <span className="text-muted-foreground">|</span>
              <span className="flex items-center gap-1.5 font-semibold">
                <CalendarRange className="h-4 w-4 text-primary" />
                {label}
                {!isSingleDay && (
                  <span className="font-normal text-muted-foreground">· range</span>
                )}
              </span>
            </div>
          </div>

          {/* The one primary location + date control for the whole dashboard */}
          <div className="flex flex-wrap items-center gap-2">
            <LocationSelector />
            <DateRangeSelector />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_PRESETS.map((p) => (
            <Button
              key={p.value}
              variant={preset === p.value ? "default" : "outline"}
              size="sm"
              className="h-11 min-w-[104px] px-4 text-sm"
              onClick={() => setPreset(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
