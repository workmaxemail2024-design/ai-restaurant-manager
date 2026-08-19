import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Store, 
  Truck, 
  Package, 
  BarChart3,
  Settings,
  ChefHat,
  Bell,
  LogOut,
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
  ChevronDown,
  ChevronRight,
  Plug,
  Shield,
  Zap,
  FileText,
  FlaskConical,
  Play,
  CalendarCheck,
  LayoutGrid,
  UserCircle,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ThemeToggle } from "@/components/ThemeToggle";
import { usePermissions, PermissionResource } from "@/hooks/usePermissions";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { usePendingReservationCount } from "@/hooks/useReservations";

interface NavItem {
  icon: typeof LayoutDashboard;
  label: string;
  path: string;
  badge?: number;
  permission?: { resource: PermissionResource; action: 'view' | 'edit' | 'admin' };
}

interface NavSection {
  title: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
  permission?: PermissionResource;
}

const navSections: NavSection[] = [
  {
    title: "Overview",
    icon: LayoutDashboard,
    permission: 'dashboard',
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/", permission: { resource: 'dashboard', action: 'view' } },
      { icon: Store, label: "Locations", path: "/locations", permission: { resource: 'locations', action: 'view' } },
    ]
  },
  {
    title: "Staff",
    icon: Users,
    permission: 'staff',
    items: [
      { icon: Users, label: "Staff List", path: "/staff", permission: { resource: 'staff', action: 'view' } },
      { icon: Calendar, label: "Shifts", path: "/staff/shifts", permission: { resource: 'staff', action: 'view' } },
      { icon: Clock, label: "Attendance", path: "/staff/attendance", permission: { resource: 'staff', action: 'view' } },
      { icon: Target, label: "KPIs", path: "/staff/kpis", permission: { resource: 'staff', action: 'view' } },
    ]
  },
  {
    title: "Menu",
    icon: ChefHat,
    permission: 'menu',
    items: [
      { icon: ChefHat, label: "Dishes", path: "/dishes", permission: { resource: 'menu', action: 'view' } },
      { icon: Euro, label: "Cost Analysis", path: "/menu/cost-analysis", permission: { resource: 'menu', action: 'view' } },
      { icon: Brain, label: "AI Engineering", path: "/menu/engineering", permission: { resource: 'ai_features', action: 'view' } },
    ]
  },
  {
    title: "Inventory",
    icon: Warehouse,
    permission: 'inventory',
    items: [
      { icon: Package, label: "Inventory Items", path: "/ingredients", permission: { resource: 'inventory', action: 'view' } },
      { icon: Warehouse, label: "Stock Levels", path: "/stock", permission: { resource: 'inventory', action: 'view' } },
      { icon: TrendingUp, label: "Forecasting", path: "/inventory/forecast", permission: { resource: 'ai_features', action: 'view' } },
    ]
  },
  {
    title: "Operations",
    icon: ShoppingCart,
    permission: 'purchase_orders',
    items: [
      { icon: Truck, label: "Suppliers", path: "/suppliers", permission: { resource: 'purchase_orders', action: 'view' } },
      { icon: ShoppingCart, label: "Purchase Orders", path: "/purchase-orders", permission: { resource: 'purchase_orders', action: 'view' } },
      { icon: FileText, label: "Documents", path: "/operations/documents", permission: { resource: 'purchase_orders', action: 'view' } },
      { icon: Receipt, label: "Sales", path: "/sales", permission: { resource: 'finance', action: 'view' } },
      { icon: BarChart3, label: "Reports", path: "/reports", permission: { resource: 'reports', action: 'view' } },
    ]
  },
  {
    title: "Reservations",
    icon: CalendarCheck,
    permission: 'dashboard',
    items: [
      { icon: CalendarCheck, label: "Bookings", path: "/reservations", permission: { resource: 'dashboard', action: 'view' } },
      { icon: LayoutGrid, label: "Floor Plan", path: "/reservations/floor", permission: { resource: 'dashboard', action: 'view' } },
      { icon: UserCircle, label: "Customers", path: "/reservations/customers", permission: { resource: 'dashboard', action: 'view' } },
      { icon: Settings2, label: "Settings", path: "/reservations/settings", permission: { resource: 'dashboard', action: 'view' } },
    ]
  },
  {
    title: "AI Intelligence",
    icon: Sparkles,
    permission: 'ai_features',
    items: [
      { icon: Brain, label: "Insights Dashboard", path: "/ai/insights", permission: { resource: 'ai_features', action: 'view' } },
      { icon: Sparkles, label: "AI Assistant", path: "/ai/assistant", permission: { resource: 'ai_features', action: 'view' } },
      { icon: Sparkles, label: "Daily Summary", path: "/ai/daily-summary", permission: { resource: 'ai_features', action: 'view' } },
      { icon: CalendarClock, label: "Staff Scheduling", path: "/ai/scheduling", permission: { resource: 'ai_features', action: 'view' } },
    ]
  },
  {
    title: "Automation",
    icon: Zap,
    permission: 'automation',
    items: [
      { icon: Zap, label: "Automation Rules", path: "/automation/rules", permission: { resource: 'automation', action: 'view' } },
    ]
  },
  {
    title: "Analytics",
    icon: BarChart3,
    permission: 'analytics',
    items: [
      { icon: Store, label: "Multi-Location", path: "/analytics/multi-location", permission: { resource: 'analytics', action: 'view' } },
      { icon: ChefHat, label: "Menu Performance", path: "/analytics/menu-performance", permission: { resource: 'analytics', action: 'view' } },
      { icon: TrendingUp, label: "Forecast", path: "/analytics/forecast", permission: { resource: 'analytics', action: 'view' } },
      { icon: BarChart3, label: "Product Intelligence", path: "/analytics/product-intelligence", permission: { resource: 'analytics', action: 'view' } },
    ]
  },
  {
    title: "Settings",
    icon: Settings,
    permission: 'settings',
    items: [
      { icon: Plug, label: "POS Integrations", path: "/settings/pos", permission: { resource: 'pos', action: 'view' } },
      { icon: Euro, label: "Financial / Overheads", path: "/settings/financial/overheads", permission: { resource: 'settings', action: 'view' } },
      { icon: Shield, label: "Role Builder", path: "/settings/roles", permission: { resource: 'settings', action: 'view' } },
      { icon: FileText, label: "Audit Log", path: "/settings/audit-log", permission: { resource: 'settings', action: 'admin' } },
      { icon: Shield, label: "Backups", path: "/settings/backups", permission: { resource: 'settings', action: 'admin' } },
    ]
  }
];

const bottomItems: NavItem[] = [
  { icon: Bell, label: "Notifications", path: "/notifications" },
];

export function PermissionFilteredSidebar() {
  const location = useLocation();
  const { hasPermission, isLoading } = usePermissions();
  const { signOut, user, currentRestaurant } = useRestaurant();
  const { data: pendingCount = 0 } = usePendingReservationCount();

  const restaurantKey = currentRestaurant?.id ?? "none";
  const scrollStorageKey = `sidebar_scroll_${restaurantKey}`;
  const openStorageKey = `sidebar_open_${restaurantKey}`;
  
  // Preserve scroll position across re-renders / route changes
  const navRef = useRef<HTMLElement>(null);
  const scrollPosRef = useRef<number>(0);

  const [openSections, setOpenSections] = useState<string[]>(() => {
    // Default: all open
    const fallback = navSections.map(s => s.title);
    if (typeof window === "undefined") return fallback;
    // We might not know the restaurant yet on first render.
    // We'll re-hydrate from storage once restaurantKey becomes available.
    return fallback;
  });

  const persistScrollNow = () => {
    const el = navRef.current;
    if (!el) return;
    scrollPosRef.current = el.scrollTop;
    if (restaurantKey !== "none") {
      try {
        sessionStorage.setItem(scrollStorageKey, String(el.scrollTop));
      } catch {
        // ignore
      }
    }
  };

  // Hydrate persisted state before paint (prevents sidebar jumping to top on navigation)
  useLayoutEffect(() => {
    if (restaurantKey === "none") return;

    try {
      const storedScroll = sessionStorage.getItem(scrollStorageKey);
      if (storedScroll !== null) {
        const parsed = Number(storedScroll);
        if (!Number.isNaN(parsed)) scrollPosRef.current = parsed;
      }

      const storedOpen = sessionStorage.getItem(openStorageKey);
      if (storedOpen) {
        const parsed = JSON.parse(storedOpen);
        if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
          setOpenSections(parsed);
        }
      }
    } catch {
      // ignore storage/JSON failures
    }
  }, [openStorageKey, restaurantKey, scrollStorageKey]);

  // Keep the active route's section open (so the user stays in the same category)
  useEffect(() => {
    const activeSection = navSections.find((s) => s.items.some((i) => i.path === location.pathname))?.title;
    if (!activeSection) return;
    setOpenSections((prev) => (prev.includes(activeSection) ? prev : [...prev, activeSection]));
  }, [location.pathname]);

  const toggleSection = (title: string) => {
    // Prevent visual jump when expanding/collapsing by capturing + restoring scrollTop.
    const el = navRef.current;
    const prevTop = el?.scrollTop ?? 0;
    persistScrollNow();

    setOpenSections((prev) => {
      const next = prev.includes(title) ? prev.filter((s) => s !== title) : [...prev, title];
      if (restaurantKey !== "none") {
        try {
          sessionStorage.setItem(openStorageKey, JSON.stringify(next));
        } catch {
          // ignore storage failures
        }
      }
      return next;
    });

    // Restore scrollTop next frame (after DOM height changes)
    requestAnimationFrame(() => {
      if (navRef.current) navRef.current.scrollTop = prevTop;
    });
  };

  // Filter sections based on permissions
  const visibleSections = navSections.filter(section => {
    if (isLoading) return true; // Show all while loading
    if (!section.permission) return true;
    return hasPermission(section.permission, 'view');
  }).map(section => ({
    ...section,
    items: section.items.filter(item => {
      if (isLoading) return true;
      if (!item.permission) return true;
      return hasPermission(item.permission.resource, item.permission.action);
    })
  })).filter(section => section.items.length > 0);

  // Persist scroll position while the user scrolls, so route changes don't reset it.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;

    const onScroll = () => {
      scrollPosRef.current = el.scrollTop;
      if (restaurantKey !== "none") {
        try {
          sessionStorage.setItem(scrollStorageKey, String(el.scrollTop));
        } catch {
          // ignore
        }
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [restaurantKey, scrollStorageKey]);

  // Restore scroll position after DOM updates (route changes and permission filtering can remount the sidebar)
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    el.scrollTop = scrollPosRef.current;
  }, [location.pathname, restaurantKey, visibleSections.length]);

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-accent">
            <ChefHat className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-lg">RestaurantAI</h1>
            <p className="text-xs text-muted-foreground">Chain Manager</p>
          </div>
        </div>
      </div>

      {/* Main Navigation - scroll position preserved via storage */}
      <nav ref={navRef} className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleSections.map((section) => (
          <Collapsible
            key={section.title}
            open={openSections.includes(section.title)}
            onOpenChange={() => toggleSection(section.title)}
          >
              <CollapsibleTrigger asChild>
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                  onPointerDown={persistScrollNow}
                >
                <section.icon className="h-3.5 w-3.5" />
                <span className="flex-1 text-left">{section.title}</span>
                {openSections.includes(section.title) ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5 pl-2">
              {section.items.map((item) => {
                // For reservation items, show pending badge on "Bookings"
                const itemBadge = item.path === '/reservations' && pendingCount > 0 ? pendingCount : item.badge;
                // Active: exact match, or for /reservations sub-routes match prefix
                const isActive = location.pathname === item.path ||
                  (item.path !== '/' && location.pathname.startsWith(item.path + '/'));
                return (
                  <NavButton
                    key={item.path}
                    {...item}
                    badge={itemBadge}
                    active={isActive}
                    onNavigate={persistScrollNow}
                  />
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </nav>

      {/* Bottom Navigation */}
      <div className="p-3 space-y-1 border-t border-sidebar-border">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>
        {bottomItems.map((item) => (
          <NavButton key={item.label} {...item} active={location.pathname === item.path} />
        ))}
        <Button 
          variant="ghost" 
          className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4 mr-3" />
          Sign Out
        </Button>
      </div>

      {/* User Profile */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/50 to-accent/50 flex items-center justify-center">
            <span className="text-sm font-semibold">
              {user?.email?.substring(0, 2).toUpperCase() || 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.email || 'User'}</p>
            <p className="text-xs text-muted-foreground truncate">Restaurant Owner</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavButton({ icon: Icon, label, path, active, badge, onNavigate }: NavItem & { active: boolean; onNavigate?: () => void }) {
  return (
    <Link to={path} onPointerDown={onNavigate} onClick={onNavigate}>
      <button
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
          active 
            ? "bg-primary/10 text-primary border border-primary/20" 
            : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
        )}
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1 text-left">{label}</span>
        {badge && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary text-primary-foreground">
            {badge}
          </span>
        )}
      </button>
    </Link>
  );
}
