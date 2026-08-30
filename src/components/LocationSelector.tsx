import { useEffect } from 'react';
import { useLocation } from '@/contexts/LocationContext';
import { useLocations } from '@/hooks/useLocations';
import { useLocationAccess } from '@/hooks/useLocationAccess';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin } from 'lucide-react';

export function LocationSelector() {
  const { selectedLocationId, setSelectedLocationId } = useLocation();
  const { data: locations = [], isLoading } = useLocations();
  const { canViewAllLocations, isLoading: accessLoading } = useLocationAccess();

  // Guard: If selectedLocationId exists but isn't in current locations, reset to null
  useEffect(() => {
    if (selectedLocationId && locations.length > 0) {
      const locationExists = locations.some(l => l.id === selectedLocationId);
      if (!locationExists) {
        setSelectedLocationId(null);
      }
    }
  }, [selectedLocationId, locations, setSelectedLocationId]);

  if (isLoading || accessLoading) {
    return (
      <div className="h-10 w-40 bg-secondary rounded-lg animate-pulse" />
    );
  }

  // Empty state: no locations exist yet
  if (locations.length === 0) {
    return (
      <Select disabled value="none">
        <SelectTrigger className="w-[180px] gap-2 opacity-60">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">No locations yet</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" disabled>No locations yet</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  // Non-owner with a single assigned location: no switcher, no "All locations".
  if (!canViewAllLocations && locations.length === 1) {
    return (
      <div className="flex h-10 w-[180px] items-center gap-2 rounded-md border border-input bg-background px-3 text-sm">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <span className="truncate">{locations[0].name}</span>
      </div>
    );
  }

  // Compute controlled value
  const currentValue = selectedLocationId || (canViewAllLocations ? "all" : locations[0].id);

  return (

    <Select
      value={currentValue}
      onValueChange={(value) => setSelectedLocationId(value === "all" ? null : value)}
    >
      <SelectTrigger className="w-[180px] gap-2">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <SelectValue placeholder="All locations" />
      </SelectTrigger>
      <SelectContent className="z-[100]">
        {canViewAllLocations && <SelectItem value="all">All locations</SelectItem>}

        {locations.map((location) => (
          <SelectItem key={location.id} value={location.id}>
            {location.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
