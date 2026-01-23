import { useNavigate } from "react-router-dom";
import { PermissionFilteredSidebar } from "@/components/dashboard/PermissionFilteredSidebar";
import { Header } from "@/components/dashboard/Header";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { LocationCard } from "@/components/dashboard/LocationCard";
import { AlertItem } from "@/components/dashboard/AlertItem";
import { AIInsightPanel } from "@/components/dashboard/AIInsightPanel";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Euro, ShoppingBag, Users, TrendingUp, Percent, Wallet } from "lucide-react";
import { useLocation } from "@/contexts/LocationContext";
import { useLocations } from "@/hooks/useLocations";
import { useStaff } from "@/hooks/useStaff";
import { useProfitMetrics } from "@/hooks/useProfitMetrics";
import { formatCurrency } from "@/lib/currency";

const alerts = [
  { type: "warning" as const, title: "Low Inventory", description: "Chicken breast running low at Downtown location", time: "5m ago" },
  { type: "success" as const, title: "Peak Performance", description: "Midtown exceeded sales target by 15%", time: "12m ago" },
  { type: "error" as const, title: "Equipment Alert", description: "Grill #2 at Harbor needs maintenance", time: "28m ago" },
  { type: "info" as const, title: "Staff Update", description: "3 new team members starting tomorrow", time: "1h ago" },
];

const Index = () => {
  const navigate = useNavigate();
  const { selectedLocationId } = useLocation();
  const { data: locations = [] } = useLocations();
  const { data: staff = [] } = useStaff(selectedLocationId);
  
  // Use profit metrics for today and 7-day periods
  const { data: metricsToday, isLoading: todayLoading } = useProfitMetrics('today', selectedLocationId);
  const { data: metrics7d, isLoading: weekLoading } = useProfitMetrics('7d', selectedLocationId);

  const activeStaffCount = staff.filter(s => s.status === "active").length;

  // Helper to format percentage with fallback message
  const formatPct = (value: number | null, fallbackMsg: string): { display: string; isPlaceholder: boolean } => {
    if (value === null) {
      return { display: fallbackMsg, isPlaceholder: true };
    }
    return { display: `${value.toFixed(1)}%`, isPlaceholder: false };
  };

  // Get display values for KPIs
  const foodCostDisplay = formatPct(
    metrics7d?.foodCostPct ?? null,
    metrics7d?.hasSales ? "Add recipes" : "No sales yet"
  );

  const labourDisplay = formatPct(
    metrics7d?.labourPct ?? null,
    metrics7d?.hasSales ? "Track attendance" : "No sales yet"
  );

  const netProfitValue = metrics7d?.netProfit ?? 0;
  const netProfitPct = metrics7d?.netProfitPct;

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
            {selectedLocationId ? "Filtered by location" : "All locations"}
          </span>
        </div>
        
        {/* Metrics Grid - 6 KPIs in 2 rows */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          {/* Row 1: Revenue, Orders, Active Staff */}
          <MetricCard 
            title="Revenue (Today)" 
            value={todayLoading ? "..." : formatCurrency(metricsToday?.revenue || 0)} 
            change={metricsToday?.hasSales ? `${metricsToday?.orders || 0} orders` : "No sales yet"} 
            changeType={metricsToday?.hasSales ? "neutral" : "neutral"} 
            icon={Euro} 
            delay={0} 
          />
          <MetricCard 
            title="Orders (Today)" 
            value={todayLoading ? "..." : String(metricsToday?.orders || 0)} 
            change={`Avg ${formatCurrency(metricsToday?.aov || 0)}`} 
            changeType="neutral" 
            icon={ShoppingBag} 
            delay={100} 
          />
          <MetricCard 
            title="Active Staff" 
            value={String(activeStaffCount)} 
            change={selectedLocationId ? "At this location" : "All locations"} 
            changeType="neutral" 
            icon={Users} 
            delay={200} 
          />
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4">
          {/* Row 2: Food Cost %, Labour %, Net Profit */}
          <MetricCard 
            title="Food Cost % (7d)" 
            value={weekLoading ? "..." : foodCostDisplay.display} 
            change={
              foodCostDisplay.isPlaceholder 
                ? (metrics7d?.hasRecipes === false ? "Add recipes to dishes" : "")
                : `Cost: ${formatCurrency(metrics7d?.foodCost || 0)}`
            } 
            changeType={
              foodCostDisplay.isPlaceholder 
                ? "neutral" 
                : (metrics7d?.foodCostPct && metrics7d.foodCostPct < 30 ? "positive" : "neutral")
            } 
            icon={TrendingUp} 
            delay={300} 
          />
          <MetricCard 
            title="Labour % (7d)" 
            value={weekLoading ? "..." : labourDisplay.display} 
            change={
              labourDisplay.isPlaceholder 
                ? (metrics7d?.hasLabour === false ? "Log attendance" : "")
                : `Cost: ${formatCurrency(metrics7d?.labourCost || 0)}`
            } 
            changeType={
              labourDisplay.isPlaceholder 
                ? "neutral" 
                : (metrics7d?.labourPct && metrics7d.labourPct < 30 ? "positive" : "neutral")
            } 
            icon={Percent} 
            delay={400} 
          />
          <MetricCard 
            title="Net Profit (7d)" 
            value={weekLoading ? "..." : formatCurrency(netProfitValue)} 
            change={
              metrics7d?.hasSales 
                ? (netProfitPct !== null ? `${netProfitPct.toFixed(1)}% margin` : "Missing cost data")
                : (metrics7d?.hasOverheads === false ? "Add overheads in Settings" : "No sales yet")
            } 
            changeType={netProfitValue > 0 ? "positive" : netProfitValue < 0 ? "negative" : "neutral"} 
            icon={Wallet} 
            delay={500} 
          />
        </div>

        <div className="grid grid-cols-3 gap-6 mt-6">
          {/* Main Content - 2 columns */}
          <div className="col-span-2 space-y-6">
            {/* Revenue Chart */}
            <RevenueChart />
            
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
