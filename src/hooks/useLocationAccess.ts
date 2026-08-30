import { useMemo } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useLocations } from '@/hooks/useLocations';

/**
 * Canonical client-side view of the user's location scope.
 *
 * Mirrors the database helpers (get_user_location_ids / user_can_access_location):
 * Owner / full-access users reach every location in the restaurant and may use
 * the "All locations" chain view. Everyone else is limited to the locations
 * explicitly assigned to them in user_location_access — which RLS already
 * enforces on `locations`, so the list returned by useLocations() is the
 * permitted set. This hook is UI convenience only; the server is authoritative.
 */
export function useLocationAccess() {
  const { hasFullAccess, isLoading: permsLoading } = usePermissions();
  const { data: locations = [], isLoading: locationsLoading } = useLocations();

  const canViewAllLocations = hasFullAccess();

  const permittedLocationIds = useMemo(
    () => locations.map((l) => l.id),
    [locations],
  );

  return {
    /** Owner / full access: may switch locations and see cross-location analytics. */
    canViewAllLocations,
    /** Locations the signed-in user is permitted to see. */
    locations,
    permittedLocationIds,
    /** Non-owner with a single assignment: the location to force-select. */
    forcedLocationId:
      !canViewAllLocations && permittedLocationIds.length > 0
        ? permittedLocationIds[0]
        : null,
    isLoading: permsLoading || locationsLoading,
  };
}
