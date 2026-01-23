import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency, formatCurrencyShort } from '@/lib/currency';

interface HourlyRevenue {
  time: string;
  revenue: number;
  orders: number;
}

interface RevenueChartProps {
  data: HourlyRevenue[];
  totalRevenue: number;
  revenueYesterday: number;
  isLoading?: boolean;
  locationLabel?: string;
}

export function RevenueChart({ 
  data, 
  totalRevenue, 
  revenueYesterday, 
  isLoading = false,
  locationLabel = "All locations combined"
}: RevenueChartProps) {
  const changeVsYesterday = revenueYesterday > 0 
    ? ((totalRevenue - revenueYesterday) / revenueYesterday) * 100 
    : 0;
  
  const changeText = revenueYesterday > 0 
    ? `${changeVsYesterday >= 0 ? '+' : ''}${changeVsYesterday.toFixed(0)}% from yesterday`
    : "No data yesterday";

  return (
    <div className="rounded-xl bg-card border border-border p-6 animate-fade-in" style={{ animationDelay: "300ms" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-semibold text-lg">Today's Revenue</h3>
          <p className="text-sm text-muted-foreground">{locationLabel}</p>
        </div>
        <div className="flex gap-4">
          <div className="text-right">
            <p className="text-2xl font-bold text-gradient">
              {isLoading ? "..." : formatCurrencyShort(totalRevenue)}
            </p>
            <p className={`text-xs ${changeVsYesterday >= 0 ? 'text-success' : 'text-destructive'}`}>
              {isLoading ? "" : changeText}
            </p>
          </div>
        </div>
      </div>
      
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="time" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              tickFormatter={(value) => formatCurrencyShort(value)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              itemStyle={{ color: 'hsl(var(--primary))' }}
              formatter={(value: number) => [formatCurrency(value), 'Revenue']}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#revenueGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
