import { useEffect, useState } from "react";
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
import { Euro, ShoppingBag, Users, Clock, CalendarDays, MapPin, Camera, Plus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuickSupplierDocDialog } from "@/components/dashboard/QuickSupplierDocDialog";
import { QuickExpenseDialog } from "@/components/dashboard/QuickExpenseDialog";
import { LabourReviewDialog } from "@/components/dashboard/LabourReviewDialog";
import { StockWastageDialog } from "@/components/dashboard/StockWastageDialog";
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
import { DailyControlCentre, useSelectedPeriodLabel } from "@/components/dashboard/DailyControlCentre";
import { DailyCompletionStrip } from "@/components/dashboard/DailyCompletionStrip";
import { DailyFinancialSummary } from "@/components/dashboard/DailyFinancialSummary";
import { DailyActionsBar } from "@/components/dashboard/DailyActionsBar";
import { DailyBookingsWidget } from "@/components/dashboard/DailyBookingsWidget";

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
  const { startDate, endDate } = useDateRange();
  const { isSingleDay, label: periodLabel } = useSelectedPeriodLabel();
  const restaurantId = currentRestaurant?.id;
  const [quickDocOpen, setQuickDocOpen] = useState(false);
  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false);
  const [labourReviewOpen, setLabourReviewOpen] = useState(false);
  const [stockReviewOpen, setStockReviewOpen] = useState(false);

  // Refresh dashboard data on mount
  useEffect(() => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && ['dashboard-overview', 'sales'].includes(key);
      }
    });
  }, [queryClient]);

  // Dashboard overview - scoped to selected date range + location
  const { data: overview, isLoading: overviewLoading } = useDashboardOverview(selectedLocationId);

  const activeStaffCount = staff.filter(s => s.status === "active").length;

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(30_100%_50%_/_0.08),_transparent_50%)] pointer-events-none z-0" />

      <PermissionFilteredSidebar />

      <main className="ml-64 p-4 sm:p-6 lg:p-8 max-w-full overflow-x-hidden">
        <Header showRestaurantSwitcher={false} showScopeSelectors={false} />

        {/* 1. Where am I? What date? — single primary location + date control */}
        <DailyControlCentre />

        {/* 2. What is missing? */}
        {isSingleDay && <DailyCompletionStrip date={startDate} />}

        {/* 3. What do I need to do? */}
        <DailyActionsBar
          locationId={selectedLocationId}
          onSupplierDoc={() => setQuickDocOpen(true)}
          onExpense={() => setQuickExpenseOpen(true)}
          onLabour={() => setLabourReviewOpen(true)}
          onStock={() => setStockReviewOpen(true)}
        />

        {/* 4. How did we perform? */}
        <DailyFinancialSummary
          startDate={startDate}
          endDate={endDate}
          locationId={selectedLocationId}
          periodLabel={periodLabel}
        />

        <div className="mt-4">
          <DailyBookingsWidget
            startDate={startDate}
            endDate={endDate}
            locationId={selectedLocationId}
            periodLabel={periodLabel}
            isSingleDay={isSingleDay}
          />
        </div>

        <StockWastageDialog
          open={stockReviewOpen}
          onOpenChange={setStockReviewOpen}
          date={startDate}
          locationId={selectedLocationId}
        />

        <LabourReviewDialog
          open={labourReviewOpen}
          onOpenChange={setLabourReviewOpen}
          date={startDate}
          locationId={selectedLocationId}
        />

        <QuickExpenseDialog
          open={quickExpenseOpen}
          onOpenChange={setQuickExpenseOpen}
          date={startDate}
          locationId={selectedLocationId}
        />

        <QuickSupplierDocDialog
          open={quickDocOpen}
          onOpenChange={setQuickDocOpen}
          date={startDate}
          locationId={selectedLocationId}
        />

        {/* Operational Snapshot */}
        <div className="flex items-center justify-between mt-6">
          <h2 className="text-lg font-semibold">Operational Snapshot</h2>
          <span className="text-xs text-muted-foreground">
            {selectedLocationId ? "Filtered by location" : "All locations"} • {periodLabel}
          </span>
        </div>

        {/* Top Metrics Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
          <MetricCard
            title={isSingleDay ? "Revenue" : "Revenue (period)"}
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
            title={isSingleDay ? "Orders" : "Orders (period)"}
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
            title={isSingleDay ? "Labour Cost" : "Labour Cost (period)"}
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

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
          {/* Main Content - 2 columns */}
          <div className="xl:col-span-2 space-y-6">
            {/* Location Status */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <h2 className="text-lg font-semibold">Location Status</h2>
                </div>
                <button className="text-sm text-primary hover:underline" onClick={() => navigate('/locations')}>View All</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
