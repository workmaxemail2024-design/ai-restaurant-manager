import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Clock, Calendar, MoreVertical, Pencil, Archive, RotateCcw, MapPin, UtensilsCrossed } from "lucide-react";
import { Menu } from "@/hooks/useMenus";
import { cn } from "@/lib/utils";

interface MenuCardProps {
  menu: Menu;
  dishCount: number;
  onEdit: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  isArchived?: boolean;
}

const dayLabels: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const dayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

export function MenuCard({ menu, dishCount, onEdit, onArchive, onRestore, isArchived }: MenuCardProps) {
  const sortedDays = [...menu.days].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
  
  // Check if all weekdays or all days
  const isAllWeekdays = sortedDays.length === 5 && 
    sortedDays.every(d => ["monday", "tuesday", "wednesday", "thursday", "friday"].includes(d));
  const isWeekend = sortedDays.length === 2 && 
    sortedDays.every(d => ["saturday", "sunday"].includes(d));
  const isEveryDay = sortedDays.length === 7;

  const getDaysDisplay = () => {
    if (isEveryDay) return "Every day";
    if (isAllWeekdays) return "Weekdays";
    if (isWeekend) return "Weekends";
    return sortedDays.map(d => dayLabels[d]).join(", ");
  };

  return (
    <Card className={cn(
      "transition-all hover:shadow-md",
      isArchived && "opacity-70"
    )}>
      <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-start justify-between">
        <div className="space-y-1">
          <h3 className="font-semibold text-lg leading-tight">{menu.name}</h3>
          {menu.locations?.name && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>{menu.locations.name}</span>
            </div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 -mt-1">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit Menu
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {isArchived ? (
              <DropdownMenuItem onClick={onRestore}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Restore
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={onArchive} className="text-destructive">
                <Archive className="h-4 w-4 mr-2" />
                Archive
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="pt-0 pb-4 px-4 space-y-3">
        {/* Time window */}
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">
            {formatTime(menu.start_time)} – {formatTime(menu.end_time)}
          </span>
        </div>
        
        {/* Days */}
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span>{getDaysDisplay()}</span>
        </div>
        
        {/* Dish count */}
        <div className="flex items-center gap-2 text-sm pt-1">
          <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
          <Badge variant="secondary" className="font-normal">
            {dishCount} {dishCount === 1 ? "dish" : "dishes"}
          </Badge>
        </div>

        {/* Status badge */}
        {isArchived && (
          <Badge variant="outline" className="mt-2">
            <Archive className="h-3 w-3 mr-1" />
            Archived
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
