import { useNavigate } from "react-router-dom";
import { PermissionFilteredSidebar } from "@/components/dashboard/PermissionFilteredSidebar";
import { Header } from "@/components/dashboard/Header";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { LocationCard } from "@/components/dashboard/LocationCard";
import { AlertItem } from "@/components/dashboard/AlertItem";
import { AIInsightPanel } from "@/components/dashboard/AIInsightPanel";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Euro, ShoppingBag, Users, TrendingUp } from "lucide-react";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { useLocation } from "@/contexts/LocationContext";
import { useLocations } from "@/hooks/useLocations";
import { useStaff } from "@/hooks/useStaff";
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
  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics(undefined, selectedLocationId);
  const { data: locations = [] } = useLocations();
  const { data: staff = [] } = useStaff(selectedLocationId);

  const activeStaffCount = staff.filter(s => s.status === "active").length;

  return (
    <div className="min-h-screen bg-background">
      {/* Background glow effect */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(30_100%_50%_/_0.08),_transparent_50%)] pointer-events-none" />
      
      <PermissionFilteredSidebar />
      
      <main className="ml-64 p-8">
        <Header />
        
        {/* Performance Overview */}
        <div className="flex items-center justify-between mt-6">
          <h2 className="text-lg font-semibold">Performance Overview</h2>
        </div>
        
        {/* Metrics Grid */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          <MetricCard 
            title="Total Revenue" 
            value={metricsLoading ? "..." : formatCurrency(metrics?.totalRevenue || 0)} 
            change={selectedLocationId ? "Filtered by location" : "All locations"} 
            changeType="neutral" 
            icon={Euro} 
            delay={0} 
          />
          <MetricCard 
            title="Orders Today" 
            value={metricsLoading ? "..." : String(metrics?.totalOrders || 0)} 
            change={`Avg ${formatCurrency(metrics?.avgOrderValue || 0)}`} 
            changeType="neutral" 
            icon={ShoppingBag} 
            delay={100} 
          />
          <MetricCard 
            title="Active Staff" 
            value={String(activeStaffCount)} 
            change={selectedLocationId ? "At selected location" : "Across all locations"} 
            changeType="neutral" 
            icon={Users} 
            delay={200} 
          />
          <MetricCard 
            title="Food Cost %" 
            value={metricsLoading ? "..." : `${(metrics?.foodCostPercent || 0).toFixed(1)}%`} 
            change={`Profit: ${formatCurrency(metrics?.totalProfit || 0)}`} 
            changeType={metrics?.foodCostPercent && metrics.foodCostPercent < 30 ? "positive" : "neutral"} 
            icon={TrendingUp} 
            delay={300} 
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
                    revenue={formatCurrency(metrics?.locationPerformance?.find(l => l.name === location.name)?.revenue || 0)}
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
