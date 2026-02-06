import { Clock } from "lucide-react";
import type { OperatingHours } from "@/components/locations/OperatingHoursEditor";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

interface TodayHoursIndicatorProps {
  operatingHours: OperatingHours | null | undefined;
}

export function TodayHoursIndicator({ operatingHours }: TodayHoursIndicatorProps) {
  const today = new Date().getDay(); // 0 = Sunday
  const todayKey = DAY_KEYS[today];
  
  if (!operatingHours) {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Clock className="h-3 w-3" />
        <span>Hours not set</span>
      </div>
    );
  }
  
  const todayHours = operatingHours[todayKey];
  
  if (!todayHours || todayHours.closed) {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Clock className="h-3 w-3" />
        <span>Closed today</span>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
      <Clock className="h-3 w-3" />
      <span>Today: {todayHours.open}–{todayHours.close}</span>
    </div>
  );
}
