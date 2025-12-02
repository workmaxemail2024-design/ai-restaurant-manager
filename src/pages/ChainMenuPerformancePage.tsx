import { useMemo } from 'react';
import { PageLayout } from '@/components/common/PageLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useDishes } from '@/hooks/useDishes';
import { useLocations } from '@/hooks/useLocations';
import { useSales } from '@/hooks/useSales';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, Lightbulb } from 'lucide-react';

export default function ChainMenuPerformancePage() {
  const { data: dishes } = useDishes();
  const { data: locations } = useLocations();
  const { data: sales } = useSales();

  const dishPerformance = useMemo(() => {
    if (!dishes || !locations || !sales) return [];
    
    return dishes.map(dish => {
      const dishSales = sales.filter(s => s.dish_id === dish.id);
      const byLocation = locations.map(loc => {
        const locSales = dishSales.filter(s => s.location_id === loc.id);
        const totalQty = locSales.reduce((sum, s) => sum + s.quantity, 0);
        const totalRevenue = locSales.reduce((sum, s) => sum + Number(s.total_price), 0);
        return {
          locationId: loc.id,
          locationName: loc.name,
          quantity: totalQty,
          revenue: totalRevenue,
          avgPrice: totalQty > 0 ? totalRevenue / totalQty : dish.selling_price,
        };
      });
      
      const totalQty = byLocation.reduce((sum, l) => sum + l.quantity, 0);
      const totalRevenue = byLocation.reduce((sum, l) => sum + l.revenue, 0);
      const prices = byLocation.filter(l => l.quantity > 0).map(l => l.avgPrice);
      const priceVariance = prices.length > 1 
        ? Math.max(...prices) - Math.min(...prices) 
        : 0;
      
      return {
        id: dish.id,
        name: dish.name,
        category: dish.category,
        basePrice: dish.selling_price,
        totalQuantity: totalQty,
        totalRevenue,
        priceVariance,
        byLocation,
        avgPerformance: locations.length > 0 ? totalQty / locations.length : 0,
      };
    }).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [dishes, locations, sales]);

  const topDishes = dishPerformance.slice(0, 5);
  const underperformers = dishPerformance.filter(d => d.avgPerformance < 2);
  const priceInconsistencies = dishPerformance.filter(d => d.priceVariance > 1);

  const recommendations = useMemo(() => {
    const recs: string[] = [];
    
    if (priceInconsistencies.length > 0) {
      recs.push(`${priceInconsistencies.length} dishes have inconsistent pricing across locations. Consider standardizing.`);
    }
    
    if (underperformers.length > 0) {
      recs.push(`${underperformers.length} dishes are underperforming. Review menu placement or consider removal.`);
    }
    
    const topDish = topDishes[0];
    if (topDish) {
      const lowLocations = topDish.byLocation.filter(l => l.quantity < topDish.avgPerformance * 0.5);
      if (lowLocations.length > 0) {
        recs.push(`"${topDish.name}" sells well overall but underperforms at ${lowLocations.length} location(s). Investigate local factors.`);
      }
    }
    
    return recs;
  }, [dishPerformance, priceInconsistencies, underperformers, topDishes]);

  const chartData = topDishes.map(dish => ({
    name: dish.name.substring(0, 15),
    revenue: dish.totalRevenue,
    quantity: dish.totalQuantity,
  }));

  return (
    <PageLayout 
      title="Chain Menu Performance" 
      description="Compare dish performance across all locations"
    >
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Total Dishes</p>
              <p className="text-2xl font-bold">{dishes?.length || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Top Performer</p>
              <p className="text-lg font-bold truncate">{topDishes[0]?.name || '-'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Price Inconsistencies</p>
              <p className="text-2xl font-bold text-yellow-500">{priceInconsistencies.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Underperformers</p>
              <p className="text-2xl font-bold text-destructive">{underperformers.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* AI Recommendations */}
        {recommendations.length > 0 && (
          <Card className="border-primary/50 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-primary" />
                AI Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Top Dishes Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Top Dishes by Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'hsl(var(--foreground))' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      color: 'hsl(var(--foreground))'
                    }} 
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Revenue ($)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="quantity" fill="hsl(var(--chart-2))" name="Quantity" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Dish Performance Table */}
        <Card>
          <CardHeader>
            <CardTitle>Dish Performance by Location</CardTitle>
            <CardDescription>Compare each dish across all locations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2">Dish</th>
                    <th className="text-right py-3 px-2">Base Price</th>
                    <th className="text-right py-3 px-2">Total Sold</th>
                    <th className="text-right py-3 px-2">Revenue</th>
                    <th className="text-right py-3 px-2">Price Variance</th>
                    <th className="text-center py-3 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dishPerformance.slice(0, 15).map(dish => (
                    <tr key={dish.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2">
                        <div>
                          <p className="font-medium">{dish.name}</p>
                          <p className="text-xs text-muted-foreground">{dish.category}</p>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right">${dish.basePrice.toFixed(2)}</td>
                      <td className="py-3 px-2 text-right">{dish.totalQuantity}</td>
                      <td className="py-3 px-2 text-right">${dish.totalRevenue.toFixed(2)}</td>
                      <td className="py-3 px-2 text-right">
                        {dish.priceVariance > 0 ? (
                          <span className="text-yellow-500">${dish.priceVariance.toFixed(2)}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {dish.avgPerformance >= 5 ? (
                          <Badge className="bg-green-500/20 text-green-500"><TrendingUp className="h-3 w-3 mr-1" />Strong</Badge>
                        ) : dish.avgPerformance >= 2 ? (
                          <Badge variant="secondary">Average</Badge>
                        ) : (
                          <Badge variant="destructive"><TrendingDown className="h-3 w-3 mr-1" />Low</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Price Inconsistencies Alert */}
        {priceInconsistencies.length > 0 && (
          <Card className="border-yellow-500/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Price Inconsistencies Detected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {priceInconsistencies.slice(0, 5).map(dish => (
                  <div key={dish.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="font-medium">{dish.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Price range: ${Math.min(...dish.byLocation.filter(l => l.quantity > 0).map(l => l.avgPrice)).toFixed(2)} - 
                        ${Math.max(...dish.byLocation.filter(l => l.quantity > 0).map(l => l.avgPrice)).toFixed(2)}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-yellow-500 border-yellow-500">
                      ${dish.priceVariance.toFixed(2)} variance
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
