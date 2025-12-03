import { Button } from "@/components/ui/button";
import { Building2, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface LocationToggleProps {
  showAllLocations: boolean;
  onToggle: (showAll: boolean) => void;
  className?: string;
}

export function LocationToggle({ showAllLocations, onToggle, className }: LocationToggleProps) {
  return (
    <div className={cn("flex items-center gap-1 p-1 bg-muted rounded-lg", className)}>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 px-3 rounded-md transition-all",
          !showAllLocations && "bg-background shadow-sm"
        )}
        onClick={() => onToggle(false)}
      >
        <Building2 className="h-4 w-4 mr-2" />
        Current Location
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 px-3 rounded-md transition-all",
          showAllLocations && "bg-background shadow-sm"
        )}
        onClick={() => onToggle(true)}
      >
        <Globe className="h-4 w-4 mr-2" />
        All Locations
      </Button>
    </div>
  );
}
