import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { PermissionFilteredSidebar } from "@/components/dashboard/PermissionFilteredSidebar";
import { Header } from "@/components/dashboard/Header";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { LocationCard } from "@/components/dashboard/LocationCard";
import { AlertItem } from "@/components/dashboard/AlertItem";
import { AIInsightPanel } from "@/components/dashboard/AIInsightPanel";
import { ActionRequiredPanel } from "@/components/dashboard/ActionRequiredPanel";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { YesterdaySummaryWidget } from "@/components/dashboard/YesterdaySummaryWidget";
import { Euro, ShoppingBag, Users, TrendingUp, Percent, Wallet, BarChart3, Clock } from "lucide-react";
import { useLocation } from "@/contexts/LocationContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useLocations } from "@/hooks/useLocations";
import { useStaff } from "@/hooks/useStaff";
import { useProfitMetrics } from "@/hooks/useProfitMetrics";
import { useDashboardOverview } from "@/hooks/useDashboardOverview";
import { formatCurrency } from "@/lib/currency";

const alerts = [
  { type: "warning" as const, title: "Low Inventory", description: "Chicken breast running low at Downtown location", time: "5m ago" },
  { type: "success" as const, title: "Peak Performance", description: "Midtown exceeded sales target by 15%", time: "12m ago" },
  { type: "error" as const, title: "Equipment Alert", description: "Grill #2 at Harbor needs maintenance", time: "28m ago" },
  { type: "info" as const, title: "Staff Update", description: "3 new team members starting tomorrow", time: "1h ago" },
];

const Index = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedLocationId } = useLocation();
  const { presetLabel, startDate, endDate } = useDateRange();
  const { data: locations = [] } = useLocations();
  const { data: staff = [] } = useStaff(selectedLocationId);
  
  // Refresh dashboard data on mount (ensures fresh data after navigating from other pages)
  useEffect(() => {
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && [
          'dashboard-overview',
          'profit-metrics',
          'sales'
        ].includes(key);
      }
    });
  }, [queryClient]);
  
  // Dashboard overview with real revenue data
  const { data: overview, isLoading: overviewLoading } = useDashboardOverview(selectedLocationId);
  
  // Use profit metrics for the selected date range
  const { data: metrics, isLoading: metricsLoading } = useProfitMetrics(selectedLocationId);

  const activeStaffCount = staff.filter(s => s.status === "active").length;

  // Calculate sales vs last week
  const salesVsLastWeek = (overview?.revenueToday || 0) - (overview?.revenueSameWeekdayLastWeek || 0);
  const salesVsLastWeekPct = overview?.revenueSameWeekdayLastWeek && overview.revenueSameWeekdayLastWeek > 0
    ? ((salesVsLastWeek / overview.revenueSameWeekdayLastWeek) * 100)
    : null;

  // Helper to format percentage with fallback message
  const formatPct = (value: number | null, fallbackMsg: string): { display: string; isPlaceholder: boolean } => {
    if (value === null) {
      return { display: fallbackMsg, isPlaceholder: true };
    }
    return { display: `${value.toFixed(1)}%`, isPlaceholder: false };
  };

  // Get display values for KPIs
  const foodCostDisplay = formatPct(
    metrics?.foodCostPct ?? null,
    metrics?.hasSales ? "Add recipes" : "No sales yet"
  );

  const labourDisplay = formatPct(
    metrics?.labourPct ?? null,
    metrics?.hasSales ? "Track attendance" : "No sales yet"
  );

  const netProfitValue = metrics?.netProfit ?? 0;
  const netProfitPct = metrics?.netProfitPct;

  // Location label for chart
  const selectedLocation = locations.find(l => l.id === selectedLocationId);
  const locationLabel = selectedLocationId && selectedLocation 
    ? selectedLocation.name 
    : "All locations combined";

  // Date range label for display
  const rangeLabel = presetLabel;

  return (
    <div className="min-h-screen bg-background">
      {/* Background glow effect */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(30_100%_50%_/_0.08),_transparent_50%)] pointer-events-none z-0" />
      
      <PermissionFilteredSidebar />
      
      <main className="ml-64 p-8">
        <Header showRestaurantSwitcher={false} />
        
        {/* Performance Overview */}
        <div className="flex items-center justify-between mt-6">
          <h2 className="text-lg font-semibold">Performance Overview</h2>
          <span className="text-xs text-muted-foreground">
            {selectedLocationId ? "Filtered by location" : "All locations"} • {rangeLabel}
          </span>
        </div>
        
        {/* Metrics Grid - Row 1: Today's key metrics */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          <MetricCard 
            title={`Revenue (${rangeLabel})`}
            value={overviewLoading ? "..." : formatCurrency(overview?.revenueToday || 0)} 
            change={overview?.ordersToday ? `${overview.ordersToday} orders` : "No sales yet"} 
            changeType={(overview?.ordersToday || 0) > 0 ? "neutral" : "neutral"} 
            icon={Euro} 
            delay={0} 
          />
          <MetricCard 
            title={`Orders (${rangeLabel})`}
            value={overviewLoading ? "..." : String(overview?.ordersToday || 0)} 
            change={`AOV ${formatCurrency(overview?.aovToday || 0)}`} 
            changeType="neutral" 
            icon={ShoppingBag} 
            delay={100} 
          />
          <MetricCard 
            title="vs Last Week" 
            value={overviewLoading ? "..." : `${salesVsLastWeek >= 0 ? '+' : ''}${formatCurrency(salesVsLastWeek)}`} 
            change={
              salesVsLastWeekPct !== null 
                ? `${salesVsLastWeekPct >= 0 ? '+' : ''}${salesVsLastWeekPct.toFixed(1)}%` 
                : (overview?.revenueSameWeekdayLastWeek === 0 ? "No data last week" : "")
            } 
            changeType={salesVsLastWeek >= 0 ? "positive" : "negative"} 
            icon={BarChart3} 
            delay={200} 
          />
          <MetricCard 
            title={`Labour (${rangeLabel})`}
            value={
              overviewLoading 
                ? "..." 
                : (overview?.hasLabourToday 
                    ? formatCurrency(overview.labourTodayCost) 
                    : "—")
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
            delay={300} 
          />
        </div>

        {/* Metrics Grid - Row 2: Period cost/profit metrics */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          <MetricCard 
            title="Active Staff" 
            value={String(activeStaffCount)} 
            change={selectedLocationId ? "At this location" : "All locations"} 
            changeType="neutral" 
            icon={Users} 
            delay={400} 
          />
          <MetricCard 
            title={`Food Cost % (${rangeLabel})`}
            value={metricsLoading ? "..." : foodCostDisplay.display} 
            change={
              foodCostDisplay.isPlaceholder 
                ? (metrics?.hasRecipes === false ? "Add recipes to dishes" : "")
                : `Cost: ${formatCurrency(metrics?.foodCost || 0)}`
            } 
            changeType={
              foodCostDisplay.isPlaceholder 
                ? "neutral" 
                : (metrics?.foodCostPct && metrics.foodCostPct < 30 ? "positive" : "neutral")
            } 
            icon={TrendingUp} 
            delay={500} 
          />
          <MetricCard 
            title={`Labour % (${rangeLabel})`}
            value={metricsLoading ? "..." : labourDisplay.display} 
            change={
              labourDisplay.isPlaceholder 
                ? (metrics?.hasLabour === false ? "Log attendance" : "")
                : `Cost: ${formatCurrency(metrics?.labourCost || 0)}`
            } 
            changeType={
              labourDisplay.isPlaceholder 
                ? "neutral" 
                : (metrics?.labourPct && metrics.labourPct < 30 ? "positive" : "neutral")
            } 
            icon={Percent} 
            delay={600} 
          />
          <MetricCard 
            title={`Net Profit (${rangeLabel})`}
            value={metricsLoading ? "..." : formatCurrency(netProfitValue)} 
            change={
              metrics?.hasSales 
                ? (netProfitPct !== null ? `${netProfitPct.toFixed(1)}% margin` : "Missing cost data")
                : (metrics?.hasOverheads === false ? "Add overheads in Settings" : "No sales yet")
            } 
            changeType={netProfitValue > 0 ? "positive" : netProfitValue < 0 ? "negative" : "neutral"} 
            icon={Wallet} 
            delay={700} 
          />
        </div>

        <div className="grid grid-cols-3 gap-6 mt-6">
          {/* Main Content - 2 columns */}
          <div className="col-span-2 space-y-6">
            {/* Revenue Chart */}
            <RevenueChart 
              data={overview?.revenueSeries || []}
              totalRevenue={overview?.revenueToday || 0}
              revenueYesterday={overview?.revenueYesterday || 0}
              isLoading={overviewLoading}
              locationLabel={locationLabel}
            />
            
            {/* Locations Grid */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Location Overview</h2>
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
            {/* Yesterday's AI Summary */}
            <YesterdaySummaryWidget />

            {/* Action Required */}
            <ActionRequiredPanel locationId={selectedLocationId} />
            
            {/* AI Insights */}
            <AIInsightPanel />
            
            {/* Alerts */}
            <div className="rounded-xl bg-card border border-border p-4 animate-fade-in" style={{ animationDelay: "500ms" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Recent Alerts</h3>
                <span className="text-xs text-muted-foreground">Last 24h</span>
              </div>
              <div className="space-y-3">
                {alerts.map((alert, index) => (
                  <AlertItem key={index} {...alert} delay={index * 50 + 500} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
