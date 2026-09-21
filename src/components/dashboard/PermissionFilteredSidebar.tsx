import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ChefHat,
  Bell,
  LogOut,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ThemeToggle } from "@/components/ThemeToggle";
import { usePermissions } from "@/hooks/usePermissions";
import { useMyMembershipRole } from "@/hooks/useRoles";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { usePendingReservationCount } from "@/hooks/useReservations";
import { NAV_SECTIONS } from "@/lib/navigation";

interface NavItem {
  icon: typeof LayoutDashboard;
  label: string;
  path: string;
  badge?: number;
}

const navSections = NAV_SECTIONS;

const bottomItems: NavItem[] = [
  { icon: Bell, label: "Notifications", path: "/notifications" },
];

export function PermissionFilteredSidebar({ className }: { className?: string }) {
  const location = useLocation();
  const { hasPagePermission, hasFullAccess, isLoading } = usePermissions();
  const { signOut, user, currentRestaurant } = useRestaurant();
  const { data: pendingCount = 0 } = usePendingReservationCount();
  const { data: myRoleName } = useMyMembershipRole();

  const restaurantKey = currentRestaurant?.id ?? "none";
  const scrollStorageKey = `sidebar_scroll_${restaurantKey}`;
  const openStorageKey = `sidebar_open_${restaurantKey}`;
  
  const navRef = useRef<HTMLElement>(null);
  const scrollPosRef = useRef<number>(0);

  const [openSections, setOpenSections] = useState<string[]>(() => {
    const fallback = navSections.map(s => s.title);
    if (typeof window === "undefined") return fallback;
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
      // ignore
    }
  }, [openStorageKey, restaurantKey, scrollStorageKey]);

  useEffect(() => {
    const activeSection = navSections.find((s) => s.items.some((i) => i.path === location.pathname))?.title;
    if (!activeSection) return;
    setOpenSections((prev) => (prev.includes(activeSection) ? prev : [...prev, activeSection]));
  }, [location.pathname]);

  const toggleSection = (title: string) => {
    const el = navRef.current;
    const prevTop = el?.scrollTop ?? 0;
    persistScrollNow();
    setOpenSections((prev) => {
      const next = prev.includes(title) ? prev.filter((s) => s !== title) : [...prev, title];
      if (restaurantKey !== "none") {
        try {
          sessionStorage.setItem(openStorageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
    requestAnimationFrame(() => {
      if (navRef.current) navRef.current.scrollTop = prevTop;
    });
  };

  const visibleSections = navSections.map(section => ({
    ...section,
    items: section.items.filter(item => {
      if (isLoading) return true;
      if (item.ownerOnly && !hasFullAccess()) return false;
      return hasPagePermission(item.path, item.resource, item.action);
    })
  })).filter(section => section.items.length > 0);

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

  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    el.scrollTop = scrollPosRef.current;
  }, [location.pathname, restaurantKey, visibleSections.length]);

  return (
    <aside className={cn("fixed left-0 top-0 h-svh w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-40", className)}>
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
                const itemBadge = item.path === '/reservations' && pendingCount > 0 ? pendingCount : undefined;
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
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4 mr-3" />
          Sign Out
        </Button>
      </div>

      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/50 to-accent/50 flex items-center justify-center">
            <span className="text-sm font-semibold">
              {user?.email?.substring(0, 2).toUpperCase() || 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.email || 'User'}</p>
            <p className="text-xs text-muted-foreground truncate">{myRoleName ?? ''}</p>
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
