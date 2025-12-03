import { Search, Calendar, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RestaurantSwitcher } from "@/components/RestaurantSwitcher";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Button } from "@/components/ui/button";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useNavigate } from "react-router-dom";

export function Header() {
  const { signOut, user } = useRestaurant();
  const navigate = useNavigate();
  
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <header className="flex items-center justify-between py-6">
      <div>
        <h1 className="text-2xl font-bold">Operations Dashboard</h1>
        <div className="flex items-center gap-2 text-muted-foreground mt-1">
          <Calendar className="h-4 w-4" />
          <span className="text-sm">{today}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Restaurant Switcher */}
        <RestaurantSwitcher />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input 
            type="text"
            placeholder="Search locations, staff..."
            className="h-10 w-64 pl-10 pr-4 rounded-lg bg-secondary border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
          />
        </div>

        {/* Notifications */}
        <NotificationBell />

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Time indicator */}
        <div className="px-4 py-2 rounded-lg bg-secondary border border-border">
          <span className="text-sm font-medium">
            {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Sign Out */}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleSignOut}
          title={`Sign out (${user?.email})`}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
