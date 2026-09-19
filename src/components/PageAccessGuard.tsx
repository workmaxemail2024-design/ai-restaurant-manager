import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { findNavPage } from '@/lib/navigation';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

/**
 * Blocks direct URL access to a page the current role cannot view.
 * Hiding a page in the sidebar is a convenience; this is the access check.
 */
export function PageAccessGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { hasPagePermission, hasFullAccess, isLoading } = usePermissions();

  const page = findNavPage(pathname);
  if (!page) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allowed =
    (!page.ownerOnly || hasFullAccess()) &&
    hasPagePermission(page.path, page.resource, page.action);

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 p-6 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <div className="text-lg font-semibold">Access denied</div>
        <p className="text-sm text-muted-foreground max-w-sm">
          Your role does not have access to {page.label}. Ask the owner if you need it.
        </p>
        <Button asChild variant="outline" className="min-h-11">
          <Link to="/">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
