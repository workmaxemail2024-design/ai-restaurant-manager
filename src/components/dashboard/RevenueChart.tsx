import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { time: '9AM', revenue: 2400, orders: 24 },
  { time: '10AM', revenue: 3200, orders: 32 },
  { time: '11AM', revenue: 4500, orders: 45 },
  { time: '12PM', revenue: 8200, orders: 82 },
  { time: '1PM', revenue: 9100, orders: 91 },
  { time: '2PM', revenue: 6800, orders: 68 },
  { time: '3PM', revenue: 4200, orders: 42 },
  { time: '4PM', revenue: 3800, orders: 38 },
  { time: '5PM', revenue: 5200, orders: 52 },
  { time: '6PM', revenue: 7800, orders: 78 },
  { time: '7PM', revenue: 9500, orders: 95 },
  { time: '8PM', revenue: 8200, orders: 82 },
];

export function RevenueChart() {
  return (
    <div className="rounded-xl bg-card border border-border p-6 animate-fade-in" style={{ animationDelay: "300ms" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-semibold text-lg">Today's Revenue</h3>
          <p className="text-sm text-muted-foreground">All locations combined</p>
        </div>
        <div className="flex gap-4">
          <div className="text-right">
            <p className="text-2xl font-bold text-gradient">$73,000</p>
            <p className="text-xs text-success">+12% from yesterday</p>
          </div>
        </div>
      </div>
      
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(30, 100%, 50%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(30, 100%, 50%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="time" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 12 }}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 12 }}
              tickFormatter={(value) => `$${value / 1000}k`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(220, 18%, 10%)',
                border: '1px solid hsl(220, 15%, 18%)',
                borderRadius: '8px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
              }}
              labelStyle={{ color: 'hsl(210, 40%, 98%)' }}
              itemStyle={{ color: 'hsl(30, 100%, 50%)' }}
              formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="hsl(30, 100%, 50%)"
              strokeWidth={2}
              fill="url(#revenueGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
