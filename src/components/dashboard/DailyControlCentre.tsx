import { MapPin, CalendarRange } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LocationSelector } from "@/components/LocationSelector";
import { DateRangeSelector } from "@/components/DateRangeSelector";
import { useDateRange, type DatePreset } from "@/contexts/DateRangeContext";
import { useLocation } from "@/contexts/LocationContext";
import { useLocations } from "@/hooks/useLocations";
import { cn } from "@/lib/utils";

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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight">Daily Control Centre</h2>
            <p className="text-sm text-muted-foreground">
              Everything below is scoped to the selected location and period.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <LocationSelector />
            </div>
            <DateRangeSelector />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="secondary"
            className="h-9 gap-2 px-3 text-sm font-semibold"
          >
            <MapPin className="h-4 w-4" />
            {locationName}
          </Badge>
          <Badge variant="outline" className="h-9 gap-2 px-3 text-sm">
            <CalendarRange className="h-4 w-4" />
            {label}
            {!isSingleDay && (
              <span className="text-muted-foreground">· range</span>
            )}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_PRESETS.map((p) => (
            <Button
              key={p.value}
              variant={preset === p.value ? "default" : "outline"}
              size="sm"
              className={cn("h-10 min-w-[96px] px-4 text-sm")}
              onClick={() => setPreset(p.value)}
            >
              {p.label}
            </Button>
          ))}
          <Badge
            variant={preset === "custom" ? "default" : "outline"}
            className="h-10 px-4 text-sm flex items-center"
          >
            Custom / single date via picker
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
