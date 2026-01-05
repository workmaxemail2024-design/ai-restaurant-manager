import { useState, useMemo } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStaff, useStaffPerformance } from "@/hooks/useStaff";
import { useSales } from "@/hooks/useSales";
import { useLocation } from "@/contexts/LocationContext";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, parseISO, getHours, subDays } from "date-fns";
import { Sparkles, Loader2, Users, Clock, TrendingUp, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatCurrency } from "@/lib/currency";

interface TimeBlock {
  time: string;
  foh: number;
  boh: number;
  bar: number;
  reason: string;
}

interface StaffSuggestion {
  day: string;
  date: string;
  shifts: TimeBlock[];
}

export default function AISchedulingPage() {
  const { selectedLocationId } = useLocation();
  const { data: staff = [] } = useStaff(selectedLocationId);
  const { data: sales = [] } = useSales(format(subDays(new Date(), 30), "yyyy-MM-dd"), undefined, selectedLocationId);
  const { data: performance = [] } = useStaffPerformance();
  
  const [aiSchedule, setAiSchedule] = useState<StaffSuggestion[] | null>(null);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const nextWeekStart = startOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 });
  const nextWeekEnd = endOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: nextWeekStart, end: nextWeekEnd });

  // Calculate hourly sales patterns - include all 24 hours for better visualization
  const hourlySales = useMemo(() => {
    const hourlyData = Array.from({ length: 24 }, (_, hour) => {
      const salesInHour = sales.filter((s) => {
        const saleHour = getHours(parseISO(s.created_at));
        return saleHour === hour;
      });
      return {
        hour: `${hour.toString().padStart(2, "0")}:00`,
        sales: salesInHour.reduce((sum, s) => sum + Number(s.total_price), 0),
        count: salesInHour.length,
      };
    });
    // Filter to business hours (8am-11pm) for cleaner display
    return hourlyData.filter((h, i) => i >= 8 && i <= 23);
  }, [sales]);

  // Peak hours detection
  const avgSales = hourlySales.reduce((sum, h) => sum + h.sales, 0) / hourlySales.length || 0;
  const peakHours = hourlySales.filter((h) => h.sales > avgSales * 1.5);

  // Staff efficiency scores
  const staffEfficiency = useMemo(() => {
    return staff.map((s) => {
      const staffPerf = performance.filter((p) => p.staff_id === s.id);
      const avgScore = staffPerf.length > 0 
        ? staffPerf.reduce((sum, p) => sum + (Number(p.score) || 0), 0) / staffPerf.length 
        : 50;
      return {
        ...s,
        avgScore,
        totalSales: staffPerf.reduce((sum, p) => sum + Number(p.kpi_sales), 0),
      };
    }).sort((a, b) => b.avgScore - a.avgScore);
  }, [staff, performance]);

  // Calculate recommended staffing per time block
  const staffingPlan = useMemo(() => {
    const blocks = [
      { time: "10:00–12:00", hours: [10, 11] },
      { time: "12:00–15:00", hours: [12, 13, 14] },
      { time: "15:00–18:00", hours: [15, 16, 17] },
      { time: "18:00–22:00", hours: [18, 19, 20, 21] },
    ];
    
    return blocks.map(block => {
      const blockSales = hourlySales
        .filter((h) => block.hours.includes(parseInt(h.hour)))
        .reduce((sum, h) => sum + h.sales, 0);
      const avgBlockSales = blockSales / block.hours.length;
      
      // Simple staffing formula: 1 FOH per €200/hr, 1 BOH per €300/hr
      const foh = Math.max(1, Math.ceil(avgBlockSales / 200));
      const boh = Math.max(1, Math.ceil(avgBlockSales / 300));
      const bar = avgBlockSales > 150 ? 1 : 0;
      
      const reason = avgBlockSales > avgSales * 1.5 ? "Peak hours" : 
                     avgBlockSales > avgSales ? "Above average" : "Standard coverage";
      
      return { time: block.time, foh, boh, bar, reason };
    });
  }, [hourlySales, avgSales]);

  const generateSchedule = async () => {
    setLoading(true);
    try {
      const response = await supabase.functions.invoke("ai-staff-scheduling", {
        body: {
          staff: staffEfficiency,
          hourlySales,
          peakHours,
          weekDays: weekDays.map((d) => format(d, "yyyy-MM-dd")),
        },
      });
      if (response.data?.schedule) {
        setAiSchedule(response.data.schedule);
        setAiInsight(response.data.insight);
      }
    } catch (error) {
      console.error("Error generating schedule:", error);
    } finally {
      setLoading(false);
    }
  };

  const getHourColor = (sales: number) => {
    if (sales > avgSales * 1.5) return "hsl(var(--destructive))";
    if (sales > avgSales) return "hsl(var(--primary))";
    return "hsl(var(--muted-foreground))";
  };

  return (
    <PageLayout
      title="AI Scheduling Assistant"
      description="Optimize staff schedules based on sales patterns"
    >
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" /> Active Staff
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{staff.filter((s) => s.status === "active").length}</div>
              <p className="text-xs text-muted-foreground">available for scheduling</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" /> Peak Hours
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{peakHours.length}</div>
              <p className="text-xs text-muted-foreground">high-traffic periods</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Top Performer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold truncate">
                {staffEfficiency[0]?.first_name} {staffEfficiency[0]?.last_name || "N/A"}
              </div>
              <p className="text-xs text-muted-foreground">
                Score: {staffEfficiency[0]?.avgScore.toFixed(1) || "N/A"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Next Week
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium">
                {format(nextWeekStart, "MMM d")} - {format(nextWeekEnd, "MMM d")}
              </div>
              <p className="text-xs text-muted-foreground">scheduling period</p>
            </CardContent>
          </Card>
        </div>

        {/* Hourly Sales Pattern */}
        <Card>
          <CardHeader>
            <CardTitle>Sales Pattern by Hour</CardTitle>
            <CardDescription>Historical sales distribution to identify peak hours (last 30 days)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {sales.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlySales}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="hour" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                      formatter={(value: number) => [formatCurrency(value), "Sales"]}
                    />
                    <Bar dataKey="sales" radius={[4, 4, 0, 0]}>
                      {hourlySales.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getHourColor(entry.sales)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No sales data available for pattern analysis. Add sales to see staffing recommendations.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recommended Staffing Plan */}
        <Card>
          <CardHeader>
            <CardTitle>Recommended Staffing by Time Block</CardTitle>
            <CardDescription>Based on sales patterns and demand analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Time Block</th>
                    <th className="text-center py-2 px-3">FOH</th>
                    <th className="text-center py-2 px-3">BOH</th>
                    <th className="text-center py-2 px-3">Bar</th>
                    <th className="text-left py-2 px-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {staffingPlan.map((block) => (
                    <tr key={block.time} className="border-b">
                      <td className="py-2 px-3 font-medium">{block.time}</td>
                      <td className="py-2 px-3 text-center">{block.foh}</td>
                      <td className="py-2 px-3 text-center">{block.boh}</td>
                      <td className="py-2 px-3 text-center">{block.bar}</td>
                      <td className="py-2 px-3">
                        <Badge variant={block.reason === "Peak hours" ? "destructive" : "secondary"}>
                          {block.reason}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Staff Efficiency Rankings */}
        <Card>
          <CardHeader>
            <CardTitle>Staff Efficiency Rankings</CardTitle>
            <CardDescription>Based on performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {staffEfficiency.slice(0, 6).map((s, i) => (
                <div key={s.id} className="p-4 rounded-lg bg-muted/50 border flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                    i === 0 ? "bg-yellow-500 text-yellow-950" :
                    i === 1 ? "bg-gray-300 text-gray-700" :
                    i === 2 ? "bg-amber-600 text-amber-100" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{s.first_name} {s.last_name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{s.role.replace("_", " ")}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{s.avgScore.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">score</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* AI Schedule Generator */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> AI Schedule Recommendation
              </CardTitle>
              <CardDescription>Generate optimized schedule for next week</CardDescription>
            </div>
            <Button onClick={generateSchedule} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Generate Schedule
            </Button>
          </CardHeader>
          <CardContent>
            {aiInsight && (
              <div className="mb-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-sm whitespace-pre-wrap">{aiInsight}</p>
              </div>
            )}
            {aiSchedule ? (
              <div className="space-y-4">
                {aiSchedule.map((day) => (
                  <div key={day.date} className="p-4 rounded-lg border">
                    <h4 className="font-semibold mb-3">{day.day} - {format(parseISO(day.date), "MMM d")}</h4>
                    <div className="space-y-2">
                      {day.shifts.map((shift, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/50">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline">{shift.time}</Badge>
                            <span className="text-sm">FOH: {shift.foh} | BOH: {shift.boh} | Bar: {shift.bar}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{shift.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">Click "Generate Schedule" to get AI-optimized staffing recommendations.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
