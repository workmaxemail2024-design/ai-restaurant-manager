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
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";

interface NavItem {
  icon: typeof LayoutDashboard;
  label: string;
  path: string;
  badge?: number;
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Store, label: "Locations", path: "/locations" },
  { icon: Truck, label: "Suppliers", path: "/suppliers" },
  { icon: Package, label: "Ingredients", path: "/ingredients" },
  { icon: Warehouse, label: "Inventory", path: "/stock" },
  { icon: ChefHat, label: "Menu / Dishes", path: "/dishes" },
  { icon: ShoppingCart, label: "Purchase Orders", path: "/purchase-orders" },
  { icon: Receipt, label: "Sales", path: "/sales" },
  { icon: BarChart3, label: "Reports", path: "/reports" },
];

const bottomItems: NavItem[] = [
  { icon: Bell, label: "Notifications", path: "#", badge: 5 },
  { icon: Settings, label: "Settings", path: "#" },
];

export function Sidebar() {
  const location = useLocation();

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
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavButton key={item.label} {...item} active={location.pathname === item.path} />
        ))}
      </nav>

      {/* Bottom Navigation */}
      <div className="p-4 space-y-1 border-t border-sidebar-border">
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
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
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
