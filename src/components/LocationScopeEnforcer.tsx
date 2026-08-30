import { useEffect } from 'react';
import { useLocation as useLocationScope } from '@/contexts/LocationContext';
import { useLocationAccess } from '@/hooks/useLocationAccess';

/**
 * Keeps the selected location inside the user's permitted scope.
 *
 * Owner / full access: untouched — they keep "All locations" and free switching.
 * Manager / Staff: "All locations" (null) and any non-permitted stored location
 * are replaced with their assigned location, so no page can run a chain-wide
 * query on their behalf. The database is still the authority; this only keeps
 * the UI honest.
 */
export function LocationScopeEnforcer() {
  const { selectedLocationId, setSelectedLocationId } = useLocationScope();
  const { canViewAllLocations, permittedLocationIds, forcedLocationId, isLoading } =
    useLocationAccess();

  useEffect(() => {
    if (isLoading || canViewAllLocations || !forcedLocationId) return;
    const inScope =
      selectedLocationId !== null && permittedLocationIds.includes(selectedLocationId);
    if (!inScope) {
      setSelectedLocationId(forcedLocationId);
    }
  }, [
    isLoading,
    canViewAllLocations,
    forcedLocationId,
    permittedLocationIds,
    selectedLocationId,
    setSelectedLocationId,
  ]);

  return null;
}
