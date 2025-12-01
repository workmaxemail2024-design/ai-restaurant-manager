import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { LocationCard } from "@/components/dashboard/LocationCard";
import { AlertItem } from "@/components/dashboard/AlertItem";
import { AIInsightPanel } from "@/components/dashboard/AIInsightPanel";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { DollarSign, ShoppingBag, Users, TrendingUp } from "lucide-react";

const metrics = [
  { title: "Total Revenue", value: "$73,240", change: "+12.5% from yesterday", changeType: "positive" as const, icon: DollarSign },
  { title: "Orders Today", value: "847", change: "+8.2% from yesterday", changeType: "positive" as const, icon: ShoppingBag },
  { title: "Active Staff", value: "124", change: "Across all locations", changeType: "neutral" as const, icon: Users },
  { title: "Avg Order Value", value: "$86.40", change: "+3.1% this week", changeType: "positive" as const, icon: TrendingUp },
];

const locations = [
  { name: "Downtown Flagship", address: "123 Main St", status: "busy" as const, revenue: "$24,500", staff: 28, waitTime: "25min" },
  { name: "Midtown Plaza", address: "456 Oak Ave", status: "open" as const, revenue: "$18,200", staff: 22, waitTime: "10min" },
  { name: "Harbor District", address: "789 Beach Rd", status: "open" as const, revenue: "$15,800", staff: 18, waitTime: "5min" },
  { name: "Airport Terminal", address: "Terminal B", status: "busy" as const, revenue: "$14,740", staff: 16, waitTime: "15min" },
];

const alerts = [
  { type: "warning" as const, title: "Low Inventory", description: "Chicken breast running low at Downtown location", time: "5m ago" },
  { type: "success" as const, title: "Peak Performance", description: "Midtown exceeded sales target by 15%", time: "12m ago" },
  { type: "error" as const, title: "Equipment Alert", description: "Grill #2 at Harbor needs maintenance", time: "28m ago" },
  { type: "info" as const, title: "Staff Update", description: "3 new team members starting tomorrow", time: "1h ago" },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Background glow effect */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(30_100%_50%_/_0.08),_transparent_50%)] pointer-events-none" />
      
      <Sidebar />
      
      <main className="ml-64 p-8">
        <Header />
        
        {/* Metrics Grid */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          {metrics.map((metric, index) => (
            <MetricCard key={metric.title} {...metric} delay={index * 100} />
          ))}
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
                <button className="text-sm text-primary hover:underline">View All</button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {locations.map((location, index) => (
                  <LocationCard key={location.name} {...location} delay={index * 100 + 200} />
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
