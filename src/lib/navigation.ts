import {
  LayoutDashboard,
  Store,
  Truck,
  Package,
  BarChart3,
  Settings,
  ChefHat,
  Warehouse,
  ShoppingCart,
  Receipt,
  Users,
  Calendar,
  Clock,
  Target,
  Euro,
  Brain,
  TrendingUp,
  Sparkles,
  CalendarClock,
  Plug,
  Shield,
  Zap,
  FileText,
  CalendarCheck,
  LayoutGrid,
  UserCircle,
  Settings2,
} from 'lucide-react';
import type { PermissionAction, PermissionResource } from '@/hooks/usePermissions';

/**
 * Single source of truth for the application navigation.
 * Used by the sidebar, the route guard and the Role Builder so that
 * all three always describe exactly the same pages.
 */
export interface NavPage {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  resource: PermissionResource;
  action: PermissionAction;
  /** Only members with full access (Owner) ever see this page. */
  ownerOnly?: boolean;
}

export interface NavSection {
  title: string;
  icon: typeof LayoutDashboard;
  resource: PermissionResource;
  items: NavPage[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    icon: LayoutDashboard,
    resource: 'dashboard',
    items: [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard, resource: 'dashboard', action: 'view' },
      { label: 'Locations', path: '/locations', icon: Store, resource: 'locations', action: 'view', ownerOnly: true },
    ],
  },
  {
    title: 'Staff',
    icon: Users,
    resource: 'staff',
    items: [
      { label: 'Staff List', path: '/staff', icon: Users, resource: 'staff', action: 'view' },
      { label: 'Shifts', path: '/staff/shifts', icon: Calendar, resource: 'staff', action: 'view' },
      { label: 'Attendance', path: '/staff/attendance', icon: Clock, resource: 'staff', action: 'view' },
      { label: 'KPIs', path: '/staff/kpis', icon: Target, resource: 'staff', action: 'view' },
    ],
  },
  {
    title: 'Menu',
    icon: ChefHat,
    resource: 'menu',
    items: [
      { label: 'Dishes', path: '/dishes', icon: ChefHat, resource: 'menu', action: 'view' },
      { label: 'Cost Analysis', path: '/menu/cost-analysis', icon: Euro, resource: 'menu', action: 'view' },
      { label: 'AI Engineering', path: '/menu/engineering', icon: Brain, resource: 'ai_features', action: 'view' },
    ],
  },
  {
    title: 'Inventory',
    icon: Warehouse,
    resource: 'inventory',
    items: [
      { label: 'Inventory Items', path: '/ingredients', icon: Package, resource: 'inventory', action: 'view' },
      { label: 'Stock Levels', path: '/stock', icon: Warehouse, resource: 'inventory', action: 'view' },
      { label: 'Forecasting', path: '/inventory/forecast', icon: TrendingUp, resource: 'ai_features', action: 'view' },
    ],
  },
  {
    title: 'Operations',
    icon: ShoppingCart,
    resource: 'purchase_orders',
    items: [
      { label: 'Suppliers', path: '/suppliers', icon: Truck, resource: 'purchase_orders', action: 'view' },
      { label: 'Purchase Orders', path: '/purchase-orders', icon: ShoppingCart, resource: 'purchase_orders', action: 'view' },
      { label: 'Documents', path: '/operations/documents', icon: FileText, resource: 'purchase_orders', action: 'view' },
      { label: 'Sales', path: '/sales', icon: Receipt, resource: 'finance', action: 'view' },
      { label: 'Reports', path: '/reports', icon: BarChart3, resource: 'reports', action: 'view' },
    ],
  },
  {
    title: 'Reservations',
    icon: CalendarCheck,
    resource: 'dashboard',
    items: [
      { label: 'Bookings', path: '/reservations', icon: CalendarCheck, resource: 'dashboard', action: 'view' },
      { label: 'Floor Plan', path: '/reservations/floor', icon: LayoutGrid, resource: 'dashboard', action: 'view' },
      { label: 'Customers', path: '/reservations/customers', icon: UserCircle, resource: 'dashboard', action: 'view' },
      { label: 'Settings', path: '/reservations/settings', icon: Settings2, resource: 'dashboard', action: 'view' },
    ],
  },
  {
    title: 'AI Intelligence',
    icon: Sparkles,
    resource: 'ai_features',
    items: [
      { label: 'Insights Dashboard', path: '/ai/insights', icon: Brain, resource: 'ai_features', action: 'view' },
      { label: 'AI Assistant', path: '/ai/assistant', icon: Sparkles, resource: 'ai_features', action: 'view' },
      { label: 'Daily Summary', path: '/ai/daily-summary', icon: Sparkles, resource: 'ai_features', action: 'view' },
      { label: 'Staff Scheduling', path: '/ai/scheduling', icon: CalendarClock, resource: 'ai_features', action: 'view' },
    ],
  },
  {
    title: 'Automation',
    icon: Zap,
    resource: 'automation',
    items: [
      { label: 'Automation Rules', path: '/automation/rules', icon: Zap, resource: 'automation', action: 'view' },
    ],
  },
  {
    title: 'Analytics',
    icon: BarChart3,
    resource: 'analytics',
    items: [
      { label: 'Multi-Location', path: '/analytics/multi-location', icon: Store, resource: 'analytics', action: 'view', ownerOnly: true },
      { label: 'Menu Performance', path: '/analytics/menu-performance', icon: ChefHat, resource: 'analytics', action: 'view', ownerOnly: true },
      { label: 'Forecast', path: '/analytics/forecast', icon: TrendingUp, resource: 'analytics', action: 'view' },
      { label: 'Product Intelligence', path: '/analytics/product-intelligence', icon: BarChart3, resource: 'analytics', action: 'view' },
    ],
  },
  {
    title: 'Settings',
    icon: Settings,
    resource: 'settings',
    items: [
      { label: 'POS Integrations', path: '/settings/pos', icon: Plug, resource: 'pos', action: 'view' },
      { label: 'Financial / Overheads', path: '/settings/financial/overheads', icon: Euro, resource: 'settings', action: 'view' },
      { label: 'Role Builder', path: '/settings/roles', icon: Shield, resource: 'settings', action: 'view' },
      { label: 'Audit Log', path: '/settings/audit-log', icon: FileText, resource: 'settings', action: 'admin' },
      { label: 'Backup & Recovery', path: '/settings/backups', icon: Shield, resource: 'settings', action: 'admin', ownerOnly: true },
    ],
  },
];

/** Flat lookup: page key (route path) -> page definition. */
export const NAV_PAGES: Record<string, NavPage> = Object.fromEntries(
  NAV_SECTIONS.flatMap((s) => s.items.map((i) => [i.path, i]))
);

/** Resolve the nav page that owns a given browser path (handles sub-routes). */
export function findNavPage(pathname: string): NavPage | undefined {
  if (NAV_PAGES[pathname]) return NAV_PAGES[pathname];
  const candidates = Object.values(NAV_PAGES)
    .filter((p) => p.path !== '/' && pathname.startsWith(p.path + '/'))
    .sort((a, b) => b.path.length - a.path.length);
  return candidates[0];
}
