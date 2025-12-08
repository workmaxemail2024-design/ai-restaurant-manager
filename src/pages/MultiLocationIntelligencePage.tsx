import { useMemo } from 'react';
import { PageLayout } from '@/components/common/PageLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocations } from '@/hooks/useLocations';
import { useSales } from '@/hooks/useSales';
import { useStock } from '@/hooks/useStock';
import { useStaff } from '@/hooks/useStaff';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend } from 'recharts';
import { Building2, TrendingUp, TrendingDown, Users, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatCurrency, currencySymbol } from '@/lib/currency';

export default function MultiLocationIntelligencePage() {
  const { data: locations } = useLocations();
  const { data: sales } = useSales();
  const { data: stock } = useStock();
  const { data: staff } = useStaff();

  const locationMetrics = useMemo(() => {
    if (!locations) return [];
    
    return locations.map(location => {
      const locationSales = sales?.filter(s => s.location_id === location.id) || [];
      const locationStock = stock?.filter(s => s.location_id === location.id) || [];
      const locationStaff = staff?.filter(s => s.location_id === location.id) || [];
      
      const totalRevenue = locationSales.reduce((sum, s) => sum + Number(s.total_price), 0);
      const avgOrderValue = locationSales.length > 0 ? totalRevenue / locationSales.length : 0;
      const stockValue = locationStock.reduce((sum, s) => sum + Number(s.quantity) * 5, 0); // estimate
      const staffCount = locationStaff.length;
      
      // Calculate health score (0-100)
      const revenueScore = Math.min(totalRevenue / 1000, 30);
      const efficiencyScore = avgOrderValue > 20 ? 25 : (avgOrderValue / 20) * 25;
      const stockScore = stockValue > 0 ? 20 : 0;
      const staffScore = staffCount > 0 ? 25 : 0;
      const healthScore = Math.round(revenueScore + efficiencyScore + stockScore + staffScore);

      return {
        id: location.id,
        name: location.name,
        revenue: totalRevenue,
        avgOrderValue,
        stockValue,
        staffCount,
        salesCount: locationSales.length,
        healthScore,
        foodCostPercent: Math.random() * 15 + 25, // Simulated
        laborCostPercent: Math.random() * 10 + 20, // Simulated
        wastePercent: Math.random() * 5 + 2, // Simulated
      };
    });
  }, [locations, sales, stock, staff]);

  const topLocation = locationMetrics.reduce((top, loc) => 
    loc.revenue > (top?.revenue || 0) ? loc : top, locationMetrics[0]);
  
  const bottomLocation = locationMetrics.reduce((bottom, loc) => 
    loc.revenue < (bottom?.revenue || Infinity) ? loc : bottom, locationMetrics[0]);

  const radarData = locationMetrics.slice(0, 5).map(loc => ({
    location: loc.name.substring(0, 10),
    Revenue: Math.min(loc.revenue / 100, 100),
    Efficiency: loc.healthScore,
    'Staff Score': Math.min(loc.staffCount * 20, 100),
    'Stock Level': Math.min(loc.stockValue / 50, 100),
  }));

  return (
    <PageLayout 
      title="Multi-Location Intelligence" 
      description="Chain-wide analytics and performance comparison"
    >
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Locations</p>
                  <p className="text-2xl font-bold">{locations?.length || 0}</p>
                </div>
                <Building2 className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(locationMetrics.reduce((sum, l) => sum + l.revenue, 0))}
                  </p>
                </div>
                <span className="h-8 w-8 text-green-500 font-bold text-2xl">{currencySymbol}</span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Top Performer</p>
                  <p className="text-lg font-bold truncate">{topLocation?.name || '-'}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Needs Attention</p>
                  <p className="text-lg font-bold truncate">{bottomLocation?.name || '-'}</p>
                </div>
                <TrendingDown className="h-8 w-8 text-destructive" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Revenue Comparison Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Location</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={locationMetrics}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--foreground))' }} />
                  <YAxis tick={{ fill: 'hsl(var(--foreground))' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      color: 'hsl(var(--foreground))'
                    }} 
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Radar Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="location" tick={{ fill: 'hsl(var(--foreground))', fontSize: 10 }} />
                    <PolarRadiusAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Radar name="Revenue" dataKey="Revenue" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                    <Radar name="Efficiency" dataKey="Efficiency" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.3} />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Health Scores */}
          <Card>
            <CardHeader>
              <CardTitle>Location Health Scores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {locationMetrics.map(location => (
                <div key={location.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{location.name}</span>
                    <Badge variant={location.healthScore >= 70 ? 'default' : location.healthScore >= 40 ? 'secondary' : 'destructive'}>
                      {location.healthScore}/100
                    </Badge>
                  </div>
                  <Progress value={location.healthScore} className="h-2" />
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>Food Cost: {location.foodCostPercent.toFixed(1)}%</span>
                    <span>Labor: {location.laborCostPercent.toFixed(1)}%</span>
                    <span>Waste: {location.wastePercent.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
              {locationMetrics.length === 0 && (
                <p className="text-muted-foreground text-center py-4">No locations found</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Location Details Table */}
        <Card>
          <CardHeader>
            <CardTitle>Location Metrics Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2">Location</th>
                    <th className="text-right py-3 px-2">Revenue</th>
                    <th className="text-right py-3 px-2">Orders</th>
                    <th className="text-right py-3 px-2">Avg Order</th>
                    <th className="text-right py-3 px-2">Staff</th>
                    <th className="text-right py-3 px-2">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {locationMetrics.map(location => (
                    <tr key={location.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2 font-medium">{location.name}</td>
                      <td className="py-3 px-2 text-right">{formatCurrency(location.revenue)}</td>
                      <td className="py-3 px-2 text-right">{location.salesCount}</td>
                      <td className="py-3 px-2 text-right">{formatCurrency(location.avgOrderValue)}</td>
                      <td className="py-3 px-2 text-right">{location.staffCount}</td>
                      <td className="py-3 px-2 text-right">
                        <Badge variant={location.healthScore >= 70 ? 'default' : 'secondary'}>
                          {location.healthScore}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
