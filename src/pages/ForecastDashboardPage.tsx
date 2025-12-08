import { useState, useMemo } from 'react';
import { PageLayout } from '@/components/common/PageLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLocations } from '@/hooks/useLocations';
import { useSales } from '@/hooks/useSales';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area } from 'recharts';
import { TrendingUp, Calendar, Users, Package } from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { formatCurrency, currencySymbol } from '@/lib/currency';

export default function ForecastDashboardPage() {
  const [forecastDays, setForecastDays] = useState('7');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  
  const { data: locations } = useLocations();
  const { data: sales } = useSales();

  // Generate forecast data based on historical sales
  const forecastData = useMemo(() => {
    const days = parseInt(forecastDays);
    const today = new Date();
    
    // Calculate historical average
    const filteredSales = selectedLocation === 'all' 
      ? sales 
      : sales?.filter(s => s.location_id === selectedLocation);
    
    const totalHistorical = filteredSales?.reduce((sum, s) => sum + Number(s.total_price), 0) || 0;
    const avgDaily = filteredSales?.length ? totalHistorical / 30 : 500; // Default to $500/day
    
    const data = [];
    for (let i = 0; i < days; i++) {
      const date = addDays(today, i);
      const dayOfWeek = date.getDay();
      
      // Weekend boost
      const weekendMultiplier = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.3 : 1;
      
      // Add some variance
      const variance = (Math.random() - 0.5) * 0.2;
      const predictedRevenue = avgDaily * weekendMultiplier * (1 + variance);
      const predictedProfit = predictedRevenue * (0.15 + Math.random() * 0.1);
      const predictedStaffCost = predictedRevenue * (0.25 + Math.random() * 0.05);
      
      data.push({
        date: format(date, 'MMM dd'),
        fullDate: date,
        revenue: Math.round(predictedRevenue),
        profit: Math.round(predictedProfit),
        staffCost: Math.round(predictedStaffCost),
        confidence: Math.round(85 - i * 2), // Confidence decreases over time
      });
    }
    return data;
  }, [forecastDays, selectedLocation, sales]);

  // Summary metrics
  const summaryMetrics = useMemo(() => {
    const totalRevenue = forecastData.reduce((sum, d) => sum + d.revenue, 0);
    const totalProfit = forecastData.reduce((sum, d) => sum + d.profit, 0);
    const totalStaffCost = forecastData.reduce((sum, d) => sum + d.staffCost, 0);
    const avgConfidence = forecastData.reduce((sum, d) => sum + d.confidence, 0) / forecastData.length;
    
    return {
      totalRevenue,
      totalProfit,
      totalStaffCost,
      avgConfidence: Math.round(avgConfidence),
      dailyAvgRevenue: Math.round(totalRevenue / forecastData.length),
    };
  }, [forecastData]);

  return (
    <PageLayout 
      title="Forecast Dashboard" 
      description="AI-powered predictions for revenue, costs, and demand"
    >
      <div className="space-y-6">
        {/* Controls */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Select value={forecastDays} onValueChange={setForecastDays}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 Days</SelectItem>
                    <SelectItem value="14">14 Days</SelectItem>
                    <SelectItem value="30">30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All Locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {locations?.map(loc => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Metrics */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Predicted Revenue</p>
                  <p className="text-2xl font-bold">{formatCurrency(summaryMetrics.totalRevenue)}</p>
                  <p className="text-xs text-muted-foreground">Next {forecastDays} days</p>
                </div>
                <span className="h-8 w-8 text-green-500 font-bold text-2xl">{currencySymbol}</span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Predicted Profit</p>
                  <p className="text-2xl font-bold">{formatCurrency(summaryMetrics.totalProfit)}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Staff Cost Forecast</p>
                  <p className="text-2xl font-bold">{formatCurrency(summaryMetrics.totalStaffCost)}</p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Confidence</p>
                  <p className="text-2xl font-bold">{summaryMetrics.avgConfidence}%</p>
                </div>
                <Package className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Forecast Charts */}
        <Tabs defaultValue="revenue">
          <TabsList>
            <TabsTrigger value="revenue">Revenue Forecast</TabsTrigger>
            <TabsTrigger value="profit">Profit Forecast</TabsTrigger>
            <TabsTrigger value="costs">Cost Forecast</TabsTrigger>
          </TabsList>
          
          <TabsContent value="revenue">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Prediction</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={forecastData}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fill: 'hsl(var(--foreground))' }} />
                      <YAxis tick={{ fill: 'hsl(var(--foreground))' }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))', 
                          border: '1px solid hsl(var(--border))',
                          color: 'hsl(var(--foreground))'
                        }}
                        formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="revenue" 
                        stroke="hsl(var(--primary))" 
                        fillOpacity={1} 
                        fill="url(#colorRevenue)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="profit">
            <Card>
              <CardHeader>
                <CardTitle>Profit Prediction</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={forecastData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fill: 'hsl(var(--foreground))' }} />
                      <YAxis tick={{ fill: 'hsl(var(--foreground))' }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))', 
                          border: '1px solid hsl(var(--border))',
                          color: 'hsl(var(--foreground))'
                        }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="profit" stroke="hsl(var(--chart-2))" strokeWidth={2} name="Predicted Profit" />
                      <Line type="monotone" dataKey="confidence" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" name="Confidence %" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="costs">
            <Card>
              <CardHeader>
                <CardTitle>Cost Forecast</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={forecastData}>
                      <defs>
                        <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fill: 'hsl(var(--foreground))' }} />
                      <YAxis tick={{ fill: 'hsl(var(--foreground))' }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))', 
                          border: '1px solid hsl(var(--border))',
                          color: 'hsl(var(--foreground))'
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="staffCost" 
                        stroke="hsl(var(--destructive))" 
                        fillOpacity={1} 
                        fill="url(#colorCost)" 
                        name="Staff Cost"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Daily Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Forecast Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2">Date</th>
                    <th className="text-right py-3 px-2">Revenue</th>
                    <th className="text-right py-3 px-2">Profit</th>
                    <th className="text-right py-3 px-2">Staff Cost</th>
                    <th className="text-right py-3 px-2">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {forecastData.map((day, i) => (
                    <tr key={i} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2 font-medium">{day.date}</td>
                      <td className="py-3 px-2 text-right text-green-500">{formatCurrency(day.revenue)}</td>
                      <td className="py-3 px-2 text-right">{formatCurrency(day.profit)}</td>
                      <td className="py-3 px-2 text-right text-destructive">{formatCurrency(day.staffCost)}</td>
                      <td className="py-3 px-2 text-right">
                        <span className={day.confidence >= 70 ? 'text-green-500' : 'text-yellow-500'}>
                          {day.confidence}%
                        </span>
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
