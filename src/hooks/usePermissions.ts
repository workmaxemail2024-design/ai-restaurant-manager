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
}

export function usePermissions() {
  // Read permissions directly from RestaurantContext
  const { permissions, isLoading, refreshPermissions } = useRestaurant();

  const hasPermission = useCallback((resource: PermissionResource, action: PermissionAction): boolean => {
    if (!permissions) return false;
    
    // Full access grants everything
    if (permissions.full_access) return true;
    
    const resourcePerms = permissions[resource];
    if (!resourcePerms) return false;
    
    // Admin implies edit implies view
    if (action === 'view') {
      return resourcePerms.view || resourcePerms.edit || resourcePerms.admin;
    }
    if (action === 'edit') {
      return resourcePerms.edit || resourcePerms.admin;
    }
    if (action === 'admin') {
      return resourcePerms.admin;
    }
    
    return false;
  }, [permissions]);

  const hasFullAccess = useCallback((): boolean => {
    return permissions?.full_access === true;
  }, [permissions]);

  return {
    permissions,
    isLoading,
    hasPermission,
    hasFullAccess,
    refreshPermissions
  };
}
