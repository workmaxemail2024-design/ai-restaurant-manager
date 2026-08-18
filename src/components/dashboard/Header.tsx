import { Calendar, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RestaurantSwitcher } from "@/components/RestaurantSwitcher";
import { LocationSelector } from "@/components/LocationSelector";
import { DateRangeSelector } from "@/components/DateRangeSelector";
import { NotificationDrawer } from "@/components/notifications/NotificationDrawer";
import { RealtimeIndicator } from "@/components/dashboard/RealtimeIndicator";
import { TodayHoursIndicator } from "@/components/dashboard/TodayHoursIndicator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocation } from "@/contexts/LocationContext";
import { useLocations } from "@/hooks/useLocations";
import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";
import { useNavigate } from "react-router-dom";
import type { OperatingHours } from "@/components/locations/OperatingHoursEditor";

interface HeaderProps {
  showRestaurantSwitcher?: boolean;
  /** Hide the location + date selectors when the page already owns them (e.g. Daily Control Centre). */
  showScopeSelectors?: boolean;
  title?: string;
}

export function Header({
  showRestaurantSwitcher = true,
  showScopeSelectors = true,
  title = "Operations Dashboard",
}: HeaderProps) {
  const { signOut, user } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const { data: locations = [] } = useLocations();
  const navigate = useNavigate();
  const { isConnected } = useRealtimeEvents({ showToasts: true });
  
  const selectedLocation = selectedLocationId 
    ? locations.find(l => l.id === selectedLocationId) 
    : null;
  
  const selectedLocationName = selectedLocation?.name || null;
  const selectedLocationHours = selectedLocation?.operating_hours as OperatingHours | null | undefined;
  
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
    <header className="flex flex-wrap items-center justify-between gap-3 py-6 relative z-50">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="flex items-center gap-4 mt-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span className="text-sm">{today}</span>
          </div>
          {selectedLocationId && (
            <TodayHoursIndicator operatingHours={selectedLocationHours} />
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 relative z-50">
        {/* Real-time Indicator */}
        <RealtimeIndicator isConnected={isConnected} />

        {/* Restaurant Switcher - conditionally rendered */}
        {showRestaurantSwitcher && <RestaurantSwitcher />}

        {/* Location Selector with Scope Label */}
        <div className="flex items-center gap-2">
          <LocationSelector />
          <Badge variant="outline" className="text-xs whitespace-nowrap hidden lg:flex">
            Scope: {selectedLocationName || "All Locations"}
          </Badge>
        </div>

        {/* Date Range Selector */}
        <DateRangeSelector />
        {/* Notifications */}
        <NotificationDrawer />

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
