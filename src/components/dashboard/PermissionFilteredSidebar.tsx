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
  DollarSign,
  Brain,
  TrendingUp,
  Sparkles,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Plug,
  Shield,
  Zap,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ThemeToggle } from "@/components/ThemeToggle";
import { usePermissions, PermissionResource } from "@/hooks/usePermissions";
import { useRestaurant } from "@/contexts/RestaurantContext";

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
      { icon: DollarSign, label: "Cost Analysis", path: "/menu/cost-analysis", permission: { resource: 'menu', action: 'view' } },
      { icon: Brain, label: "AI Engineering", path: "/menu/engineering", permission: { resource: 'ai_features', action: 'view' } },
    ]
  },
  {
    title: "Inventory",
    icon: Warehouse,
    permission: 'inventory',
    items: [
      { icon: Package, label: "Ingredients", path: "/ingredients", permission: { resource: 'inventory', action: 'view' } },
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
      { icon: Receipt, label: "Sales", path: "/sales", permission: { resource: 'finance', action: 'view' } },
      { icon: BarChart3, label: "Reports", path: "/reports", permission: { resource: 'reports', action: 'view' } },
    ]
  },
  {
    title: "AI Intelligence",
    icon: Sparkles,
    permission: 'ai_features',
    items: [
      { icon: Brain, label: "Insights Dashboard", path: "/ai/insights", permission: { resource: 'ai_features', action: 'view' } },
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
    ]
  },
  {
    title: "Settings",
    icon: Settings,
    permission: 'settings',
    items: [
      { icon: Plug, label: "POS Integrations", path: "/settings/pos", permission: { resource: 'pos', action: 'view' } },
      { icon: Shield, label: "Role Builder", path: "/settings/roles", permission: { resource: 'settings', action: 'view' } },
      { icon: FileText, label: "Audit Log", path: "/settings/audit-log", permission: { resource: 'settings', action: 'view' } },
    ]
  }
];

const bottomItems: NavItem[] = [
  { icon: Bell, label: "Notifications", path: "/notifications" },
];

export function PermissionFilteredSidebar() {
  const location = useLocation();
  const { hasPermission, isLoading } = usePermissions();
  const { signOut, user } = useRestaurant();
  const [openSections, setOpenSections] = useState<string[]>(
    navSections.map(s => s.title)
  );

  const toggleSection = (title: string) => {
    setOpenSections(prev => 
      prev.includes(title) 
        ? prev.filter(s => s !== title)
        : [...prev, title]
    );
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

      {/* Main Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleSections.map((section) => (
          <Collapsible
            key={section.title}
            open={openSections.includes(section.title)}
            onOpenChange={() => toggleSection(section.title)}
          >
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
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
              {section.items.map((item) => (
                <NavButton key={item.path} {...item} active={location.pathname === item.path} />
              ))}
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

function NavButton({ icon: Icon, label, path, active, badge }: NavItem & { active: boolean }) {
  return (
    <Link to={path}>
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
