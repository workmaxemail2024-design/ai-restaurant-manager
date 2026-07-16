import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { PermissionFilteredSidebar } from "@/components/dashboard/PermissionFilteredSidebar";
import { Header } from "@/components/dashboard/Header";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { LocationCard } from "@/components/dashboard/LocationCard";
import { AlertItem } from "@/components/dashboard/AlertItem";
import { ActionRequiredPanel } from "@/components/dashboard/ActionRequiredPanel";
import { YesterdaySummaryWidget } from "@/components/dashboard/YesterdaySummaryWidget";
import { TodayHoursIndicator } from "@/components/dashboard/TodayHoursIndicator";
import { Euro, ShoppingBag, Users, Clock, CalendarDays, MapPin } from "lucide-react";
import { useLocation } from "@/contexts/LocationContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useLocations } from "@/hooks/useLocations";
import { useStaff } from "@/hooks/useStaff";
import { useDashboardOverview } from "@/hooks/useDashboardOverview";
import { usePendingReservationCount } from "@/hooks/useReservations";
import { formatCurrency } from "@/lib/currency";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DataHealthPanel } from "@/components/dashboard/DataHealthPanel";
import { OwnerInsightsPanel } from "@/components/dashboard/OwnerInsightsPanel";
import type { OperatingHours } from "@/components/locations/OperatingHoursEditor";

const Index = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedLocationId } = useLocation();
  const { currentRestaurant } = useRestaurant();
  const { data: locations = [] } = useLocations();
  const { data: staff = [] } = useStaff(selectedLocationId);
  const { data: pendingReservations = 0 } = usePendingReservationCount();
  const restaurantId = currentRestaurant?.id;

  // Refresh dashboard data on mount
  useEffect(() => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && ['dashboard-overview', 'sales'].includes(key);
      }
    });
  }, [queryClient]);

  // Dashboard overview - today only
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { data: overview, isLoading: overviewLoading } = useDashboardOverview(selectedLocationId);

  const activeStaffCount = staff.filter(s => s.status === "active").length;

  // Today's bookings (covers + count)
  const { data: todayBookings } = useQuery({
    queryKey: ["dashboard-today-bookings", restaurantId, selectedLocationId ?? "all", todayStr],
    queryFn: async () => {
      if (!restaurantId) return { count: 0, covers: 0 };
      let q = supabase
        .from("reservations")
        .select("party_size, status")
        .eq("restaurant_id", restaurantId)
        .gte("start_at", `${todayStr}T00:00:00`)
        .lte("start_at", `${todayStr}T23:59:59`)
        .not("status", "in", '("cancelled","declined","no_show")');
      if (selectedLocationId) q = q.eq("location_id", selectedLocationId);
      const { data } = await q;
      const rows = data || [];
      return {
        count: rows.length,
        covers: rows.reduce((s, r) => s + (r.party_size || 0), 0),
      };
    },
    enabled: !!restaurantId,
    staleTime: 30000,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(30_100%_50%_/_0.08),_transparent_50%)] pointer-events-none z-0" />

      <PermissionFilteredSidebar />

      <main className="ml-64 p-8">
        <Header showRestaurantSwitcher={false} />

        {/* Operational Snapshot */}
        <div className="flex items-center justify-between mt-6">
          <h2 className="text-lg font-semibold">Operational Snapshot</h2>
          <span className="text-xs text-muted-foreground">
            {selectedLocationId ? "Filtered by location" : "All locations"} • Today
          </span>
        </div>

        {/* Top Metrics Row */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          <MetricCard
            title="Revenue Today"
            value={overviewLoading ? "..." : formatCurrency(overview?.revenueToday || 0)}
            change={
              overview?.ordersToday != null
                ? `${overview.ordersToday} orders`
                : overview?.revenueToday
                  ? "Orders: —"
                  : "No sales yet"
            }
            changeType="neutral"
            icon={Euro}
            delay={0}
          />
          <MetricCard
            title="Orders Today"
            value={overviewLoading ? "..." : overview?.ordersToday != null ? String(overview.ordersToday) : "—"}
            change={
              overview?.aovToday != null
                ? `AOV ${formatCurrency(overview.aovToday)}`
                : "AOV —"
            }
            changeType="neutral"
            icon={ShoppingBag}
            delay={100}
          />

          <MetricCard
            title="Labour Cost Today"
            value={
              overviewLoading
                ? "..."
                : overview?.hasLabourToday
                  ? formatCurrency(overview.labourTodayCost)
                  : "—"
            }
            change={
              overview?.hasLabourToday
                ? (overview.labourTodayPct !== null
                  ? `${overview.labourTodayPct.toFixed(1)}% of revenue`
                  : "No revenue yet")
                : "Log attendance"
            }
            changeType={
              overview?.hasLabourToday && overview.labourTodayPct !== null && overview.labourTodayPct < 30
                ? "positive"
                : "neutral"
            }
            icon={Clock}
            delay={200}
          />
          <MetricCard
            title="Active Staff"
            value={String(activeStaffCount)}
            change={selectedLocationId ? "At this location" : "All locations"}
            changeType="neutral"
            icon={Users}
            delay={300}
          />
        </div>

        <div className="grid grid-cols-3 gap-6 mt-6">
          {/* Main Content - 2 columns */}
          <div className="col-span-2 space-y-6">
            {/* Today's Bookings */}
            <Card className="animate-fade-in" style={{ animationDelay: "200ms" }}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">Today's Bookings</h3>
                  </div>
                  <button
                    className="text-sm text-primary hover:underline"
                    onClick={() => navigate("/reservations")}
                  >
                    View All
                  </button>
                </div>
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-2xl font-bold">{todayBookings?.count ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Reservations</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{todayBookings?.covers ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Covers</p>
                  </div>
                  {pendingReservations > 0 && (
                    <Badge variant="destructive" className="text-xs gap-1">
                      {pendingReservations} pending
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Location Status */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <h2 className="text-lg font-semibold">Location Status</h2>
                </div>
                <button className="text-sm text-primary hover:underline" onClick={() => navigate('/locations')}>View All</button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {locations.slice(0, 4).map((location, index) => (
                  <LocationCard
                    key={location.id}
                    name={location.name}
                    address={location.address || ""}
                    status="open"
                    revenue="--"
                    staff={staff.filter(s => s.location_id === location.id && s.status === "active").length}
                    waitTime="--"
                    delay={index * 100 + 200}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar Content - 1 column */}
          <div className="space-y-6">
            {/* Owner Intelligence */}
            <OwnerInsightsPanel />

            {/* Data Health */}
            <DataHealthPanel locationId={selectedLocationId} />

            {/* Yesterday's AI Summary - single small insight card */}
            <YesterdaySummaryWidget />

            {/* Action Required / Alerts */}
            <ActionRequiredPanel locationId={selectedLocationId} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
