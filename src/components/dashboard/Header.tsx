import { Search, Bell, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RestaurantSwitcher } from "@/components/RestaurantSwitcher";

export function Header() {
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

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
        <Button variant="outline" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
            3
          </span>
        </Button>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Time indicator */}
        <div className="px-4 py-2 rounded-lg bg-secondary border border-border">
          <span className="text-sm font-medium">
            {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </header>
  );
}
