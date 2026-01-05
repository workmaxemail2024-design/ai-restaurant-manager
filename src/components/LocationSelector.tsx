import { useLocation } from '@/contexts/LocationContext';
import { useLocations } from '@/hooks/useLocations';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin } from 'lucide-react';

export function LocationSelector() {
  const { selectedLocationId, setSelectedLocationId } = useLocation();
  const { data: locations = [], isLoading } = useLocations();

  if (isLoading) {
    return (
      <div className="h-10 w-40 bg-secondary rounded-lg animate-pulse" />
    );
  }

  if (locations.length === 0) {
    return null;
  }

  return (
    <Select
      value={selectedLocationId || "all"}
      onValueChange={(value) => setSelectedLocationId(value === "all" ? null : value)}
    >
      <SelectTrigger className="w-[180px] gap-2">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <SelectValue placeholder="All locations" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All locations</SelectItem>
        {locations.map((location) => (
          <SelectItem key={location.id} value={location.id}>
            {location.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
