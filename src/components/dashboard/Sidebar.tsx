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
  FlaskConical
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ThemeToggle } from "@/components/ThemeToggle";

interface NavItem {
  icon: typeof LayoutDashboard;
  label: string;
  path: string;
  badge?: number;
}

interface NavSection {
  title: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "Overview",
    icon: LayoutDashboard,
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/" },
      { icon: Store, label: "Locations", path: "/locations" },
    ]
  },
  {
    title: "Staff",
    icon: Users,
    items: [
      { icon: Users, label: "Staff List", path: "/staff" },
      { icon: Calendar, label: "Shifts", path: "/staff/shifts" },
      { icon: Clock, label: "Attendance", path: "/staff/attendance" },
      { icon: Target, label: "KPIs", path: "/staff/kpis" },
    ]
  },
  {
    title: "Menu",
    icon: ChefHat,
    items: [
      { icon: ChefHat, label: "Dishes", path: "/dishes" },
      { icon: Euro, label: "Cost Analysis", path: "/menu/cost-analysis" },
      { icon: Brain, label: "AI Engineering", path: "/menu/engineering" },
    ]
  },
  {
    title: "Inventory",
    icon: Warehouse,
    items: [
      { icon: Package, label: "Ingredients", path: "/ingredients" },
      { icon: Warehouse, label: "Stock Levels", path: "/stock" },
      { icon: TrendingUp, label: "Forecasting", path: "/inventory/forecast" },
    ]
  },
  {
    title: "Operations",
    icon: ShoppingCart,
    items: [
      { icon: Truck, label: "Suppliers", path: "/suppliers" },
      { icon: ShoppingCart, label: "Purchase Orders", path: "/purchase-orders" },
      { icon: Receipt, label: "Sales", path: "/sales" },
      { icon: BarChart3, label: "Reports", path: "/reports" },
    ]
  },
  {
    title: "AI Intelligence",
    icon: Sparkles,
    items: [
      { icon: Sparkles, label: "Daily Summary", path: "/ai/daily-summary" },
      { icon: CalendarClock, label: "Staff Scheduling", path: "/ai/scheduling" },
    ]
  },
  {
    title: "Analytics",
    icon: BarChart3,
    items: [
      { icon: Store, label: "Multi-Location", path: "/analytics/multi-location" },
      { icon: ChefHat, label: "Menu Performance", path: "/analytics/menu-performance" },
      { icon: TrendingUp, label: "Forecast", path: "/analytics/forecast" },
    ]
  },
  {
    title: "Settings",
    icon: Settings,
    items: [
      { icon: Plug, label: "POS Integrations", path: "/settings/pos" },
      { icon: FlaskConical, label: "System QA", path: "/settings/system-qa" },
    ]
  }
];

const bottomItems: NavItem[] = [
  { icon: Bell, label: "Notifications", path: "#", badge: 5 },
];

export function Sidebar() {
  const location = useLocation();
  const [openSections, setOpenSections] = useState<string[]>(["Overview", "Staff", "Menu", "Inventory", "Operations", "AI Intelligence", "Analytics", "Settings"]);

  const toggleSection = (title: string) => {
    setOpenSections(prev => 
      prev.includes(title) 
        ? prev.filter(s => s !== title)
        : [...prev, title]
    );
  };

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

      {/* Main Navigation - scroll position preserved automatically */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto scroll-smooth">
        {navSections.map((section) => (
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
          <NavButton key={item.label} {...item} active={false} />
        ))}
        <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10">
          <LogOut className="h-4 w-4 mr-3" />
          Sign Out
        </Button>
      </div>

      {/* User Profile */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/50 to-accent/50 flex items-center justify-center">
            <span className="text-sm font-semibold">JD</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">John Doe</p>
            <p className="text-xs text-muted-foreground truncate">Regional Manager</p>
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
