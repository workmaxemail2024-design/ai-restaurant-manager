import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useLocationAccess } from '@/hooks/useLocationAccess';

/**
 * Route guard for cross-location (chain) surfaces.
 * Only Owner / full-access users may compare or aggregate multiple locations;
 * everyone else is redirected back to their own dashboard. URL manipulation
 * therefore cannot reveal another location, and the database RLS blocks the
 * underlying data regardless.
 */
export function RequireAllLocations({ children }: { children: ReactNode }) {
  const { canViewAllLocations, isLoading } = useLocationAccess();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canViewAllLocations) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
