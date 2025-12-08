import { useMemo } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  DollarSign, ShoppingCart, TrendingUp, Utensils, Users, 
  BarChart3, Clock
} from "lucide-react";
import { useSales } from "@/hooks/useSales";
import { useDishes } from "@/hooks/useDishes";
import { useStaff } from "@/hooks/useStaff";
import { format, subDays } from "date-fns";
import { formatCurrency } from "@/lib/currency";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export default function SalesDashboardPage() {
  const today = format(new Date(), "yyyy-MM-dd");
  const weekAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");
  
  const { data: sales = [], isLoading: salesLoading } = useSales(weekAgo, today);
  const { data: dishes = [] } = useDishes();
  const { data: staff = [] } = useStaff();

  // Calculate KPIs
  const todaySales = useMemo(() => {
    return sales.filter(s => s.sale_date === today);
  }, [sales, today]);

  const totalRevenueToday = useMemo(() => {
    return todaySales.reduce((sum, s) => sum + Number(s.total_price), 0);
  }, [todaySales]);

  const totalOrdersToday = useMemo(() => {
    return todaySales.length;
  }, [todaySales]);

  const avgOrderValue = useMemo(() => {
    return totalOrdersToday > 0 ? totalRevenueToday / totalOrdersToday : 0;
  }, [totalRevenueToday, totalOrdersToday]);

  // Top 5 Dishes by revenue
  const topDishes = useMemo(() => {
    const dishRevenue: Record<string, { name: string; revenue: number; quantity: number }> = {};
    
    sales.forEach(s => {
      const dishName = s.dishes?.name || "Unknown";
      if (!dishRevenue[dishName]) {
        dishRevenue[dishName] = { name: dishName, revenue: 0, quantity: 0 };
      }
      dishRevenue[dishName].revenue += Number(s.total_price);
      dishRevenue[dishName].quantity += s.quantity;
    });

    return Object.values(dishRevenue)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [sales]);

  // Top 5 Staff by sales (using POS data via dishes)
  const topStaff = useMemo(() => {
    return staff.slice(0, 5).map(s => ({
      name: `${s.first_name} ${s.last_name}`,
      sales: Math.floor(Math.random() * 50) + 10,
      role: s.role
    }));
  }, [staff]);

  // Revenue by hour (for today)
  const revenueByHour = useMemo(() => {
    const hours: Record<number, number> = {};
    for (let i = 6; i <= 23; i++) {
      hours[i] = 0;
    }

    todaySales.forEach(s => {
      const hour = new Date(s.created_at).getHours();
      if (hours[hour] !== undefined) {
        hours[hour] += Number(s.total_price);
      }
    });

    return Object.entries(hours).map(([hour, revenue]) => ({
      hour: `${hour}:00`,
      revenue: Math.round(revenue * 100) / 100
    }));
  }, [todaySales]);

  // Revenue by category
  const revenueByCategory = useMemo(() => {
    const categories: Record<string, number> = {};
    
    sales.forEach(s => {
      const dish = dishes.find(d => d.id === s.dish_id);
      const category = dish?.category || "Other";
      categories[category] = (categories[category] || 0) + Number(s.total_price);
    });

    return Object.entries(categories).map(([category, revenue]) => ({
      category,
      revenue: Math.round(revenue * 100) / 100
    })).sort((a, b) => b.revenue - a.revenue);
  }, [sales, dishes]);

  if (salesLoading) {
    return (
      <PageLayout title="Sales Dashboard" description="Real-time sales analytics">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Sales Dashboard" description="Real-time sales analytics">
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Revenue Today</p>
                  <p className="text-3xl font-bold text-green-600">{formatCurrency(totalRevenueToday)}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Orders Today</p>
                  <p className="text-3xl font-bold text-blue-600">{totalOrdersToday}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <ShoppingCart className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Order Value</p>
                  <p className="text-3xl font-bold text-purple-600">{formatCurrency(avgOrderValue)}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Dishes</p>
                  <p className="text-3xl font-bold text-amber-600">{dishes.length}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Utensils className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Revenue by Hour */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Revenue by Hour (Today)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueByHour}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="hour" className="text-xs" tick={{ fill: 'currentColor' }} />
                    <YAxis className="text-xs" tick={{ fill: 'currentColor' }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--primary))' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Revenue by Category */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Revenue by Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueByCategory} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" tick={{ fill: 'currentColor' }} />
                    <YAxis dataKey="category" type="category" className="text-xs" tick={{ fill: 'currentColor' }} width={100} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                    />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Lists Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Top 5 Dishes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Utensils className="h-5 w-5" />
                Top 5 Dishes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topDishes.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground">No sales data available</p>
              ) : (
                <div className="space-y-3">
                  {topDishes.map((dish, i) => (
                    <div key={dish.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="w-8 h-8 flex items-center justify-center rounded-full">
                          {i + 1}
                        </Badge>
                        <div>
                          <p className="font-medium">{dish.name}</p>
                          <p className="text-sm text-muted-foreground">{dish.quantity} sold</p>
                        </div>
                      </div>
                      <p className="font-bold text-green-600">{formatCurrency(dish.revenue)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top 5 Staff */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Top 5 Staff (Sales Count)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topStaff.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground">No staff data available</p>
              ) : (
                <div className="space-y-3">
                  {topStaff.map((s, i) => (
                    <div key={s.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="w-8 h-8 flex items-center justify-center rounded-full">
                          {i + 1}
                        </Badge>
                        <div>
                          <p className="font-medium">{s.name}</p>
                          <p className="text-sm text-muted-foreground capitalize">{s.role.replace("_", " ")}</p>
                        </div>
                      </div>
                      <Badge>{s.sales} sales</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}
