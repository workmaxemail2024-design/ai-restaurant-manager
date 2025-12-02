import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions, PermissionResource, PermissionAction } from '@/hooks/usePermissions';
import { Loader2 } from 'lucide-react';

interface RequirePermissionProps {
  resource: PermissionResource;
  action: PermissionAction;
  children: ReactNode;
  fallback?: ReactNode;
  redirectTo?: string;
}

export function RequirePermission({ 
  resource, 
  action, 
  children, 
  fallback,
  redirectTo 
}: RequirePermissionProps) {
  const { hasPermission, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasPermission(resource, action)) {
    if (redirectTo) {
      return <Navigate to={redirectTo} replace />;
    }
    
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="text-muted-foreground text-lg mb-2">Access Denied</div>
        <p className="text-sm text-muted-foreground/70">
          You don't have permission to access this feature.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

// HOC version for wrapping entire pages
export function withPermission<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  resource: PermissionResource,
  action: PermissionAction,
  redirectTo?: string
) {
  return function PermissionGuardedComponent(props: P) {
    return (
      <RequirePermission resource={resource} action={action} redirectTo={redirectTo}>
        <WrappedComponent {...props} />
      </RequirePermission>
    );
  };
}
