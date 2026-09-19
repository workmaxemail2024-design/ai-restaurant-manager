import { useCallback } from 'react';
import { useRestaurant } from '@/contexts/RestaurantContext';

export type PermissionAction = 'view' | 'edit' | 'admin';

export type PermissionResource = 
  | 'dashboard'
  | 'staff'
  | 'menu'
  | 'inventory'
  | 'purchase_orders'
  | 'reports'
  | 'analytics'
  | 'ai_features'
  | 'pos'
  | 'settings'
  | 'automation'
  | 'finance'
  | 'locations';

export interface ResourcePermissions {
  view: boolean;
  edit: boolean;
  admin: boolean;
}

export interface Permissions {
  full_access?: boolean;
  dashboard?: ResourcePermissions;
  staff?: ResourcePermissions;
  menu?: ResourcePermissions;
  inventory?: ResourcePermissions;
  purchase_orders?: ResourcePermissions;
  reports?: ResourcePermissions;
  analytics?: ResourcePermissions;
  ai_features?: ResourcePermissions;
  pos?: ResourcePermissions;
  settings?: ResourcePermissions;
  automation?: ResourcePermissions;
  finance?: ResourcePermissions;
  locations?: ResourcePermissions;
  /**
   * Optional page-level overrides, keyed by route path.
   * When a page entry exists it fully replaces the category permission for
   * that page — including switching View off while the category has it on.
   * Roles without this key keep working on category permissions alone.
   */
  pages?: Record<string, ResourcePermissions>;
}

/** Apply the admin > edit > view implication rules to one permission entry. */
export function grantsAction(perms: ResourcePermissions | undefined, action: PermissionAction): boolean {
  if (!perms) return false;
  if (action === 'admin') return !!perms.admin;
  if (action === 'edit') return !!perms.edit || !!perms.admin;
  return !!perms.view || !!perms.edit || !!perms.admin;
}

/**
 * Single resolver used by the sidebar, the route guard and in-page checks.
 * Page overrides win over the category; otherwise the category applies.
 */
export function resolvePermission(
  permissions: Permissions | null | undefined,
  resource: PermissionResource,
  action: PermissionAction,
  pageKey?: string
): boolean {
  if (!permissions) return false;
  if (permissions.full_access) return true;

  const pageEntry = pageKey ? permissions.pages?.[pageKey] : undefined;
  if (pageEntry) return grantsAction(pageEntry, action);

  return grantsAction(permissions[resource], action);
}

export function usePermissions() {
  // Read permissions directly from RestaurantContext
  const { permissions, isLoading, refreshPermissions } = useRestaurant();

  const hasPermission = useCallback((resource: PermissionResource, action: PermissionAction): boolean => {
    return resolvePermission(permissions as Permissions | null, resource, action);
  }, [permissions]);

  /** Permission check for a specific page (route path), honouring page overrides. */
  const hasPagePermission = useCallback((
    pageKey: string,
    resource: PermissionResource,
    action: PermissionAction
  ): boolean => {
    return resolvePermission(permissions as Permissions | null, resource, action, pageKey);
  }, [permissions]);

  const hasFullAccess = useCallback((): boolean => {
    return (permissions as Permissions | null)?.full_access === true;
  }, [permissions]);

  return {
    permissions,
    isLoading,
    hasPermission,
    hasPagePermission,
    hasFullAccess,
    refreshPermissions
  };
}
