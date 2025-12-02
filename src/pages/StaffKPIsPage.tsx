import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStaff, useStaffPerformance, useUpsertPerformance } from "@/hooks/useStaff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TrendingUp, TrendingDown, Users, DollarSign, AlertTriangle, Plus } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, parseISO, subDays } from "date-fns";

export default function StaffKPIsPage() {
  const { data: staff = [] } = useStaff();
  const [selectedStaff, setSelectedStaff] = useState<string>("");
  const { data: performance = [] } = useStaffPerformance(selectedStaff || undefined);
  const upsertPerformance = useUpsertPerformance();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    staff_id: "",
    date: new Date().toISOString().split("T")[0],
    kpi_sales: 0,
    kpi_customers_served: 0,
    kpi_errors: 0,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await upsertPerformance.mutateAsync(form);
    setOpen(false);
  };

  // Calculate aggregate stats
  const avgSales = performance.length > 0 
    ? performance.reduce((sum, p) => sum + Number(p.kpi_sales), 0) / performance.length 
    : 0;
  const avgCustomers = performance.length > 0 
    ? performance.reduce((sum, p) => sum + p.kpi_customers_served, 0) / performance.length 
    : 0;
  const totalErrors = performance.reduce((sum, p) => sum + p.kpi_errors, 0);
  const avgScore = performance.length > 0 && performance.some(p => p.score !== null)
    ? performance.filter(p => p.score !== null).reduce((sum, p) => sum + Number(p.score), 0) / performance.filter(p => p.score !== null).length
    : 0;

  // Prepare chart data
  const chartData = performance
    .slice(0, 30)
    .reverse()
    .map((p) => ({
      date: format(parseISO(p.date), "MMM d"),
      sales: Number(p.kpi_sales),
      customers: p.kpi_customers_served,
      errors: p.kpi_errors,
    }));

  return (
    <PageLayout
      title="Staff KPIs"
      description="Track and analyze staff performance metrics"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Log Performance</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log Staff Performance</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Staff Member</Label>
                <Select value={form.staff_id} onValueChange={(v) => setForm({ ...form, staff_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Sales ($)</Label>
                  <Input type="number" step="0.01" value={form.kpi_sales} onChange={(e) => setForm({ ...form, kpi_sales: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-2">
                  <Label>Customers</Label>
                  <Input type="number" value={form.kpi_customers_served} onChange={(e) => setForm({ ...form, kpi_customers_served: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="space-y-2">
                  <Label>Errors</Label>
                  <Input type="number" value={form.kpi_errors} onChange={(e) => setForm({ ...form, kpi_errors: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <Button type="submit" className="w-full">Save Performance</Button>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-6">
        {/* Staff Filter */}
        <div className="flex items-center gap-4">
          <Label>Filter by Staff:</Label>
          <Select value={selectedStaff} onValueChange={setSelectedStaff}>
            <SelectTrigger className="w-64"><SelectValue placeholder="All Staff" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Staff</SelectItem>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Avg Sales</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${avgSales.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">per day</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Avg Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgCustomers.toFixed(0)}</div>
              <p className="text-xs text-muted-foreground">served per day</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Errors</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalErrors}</div>
              <p className="text-xs text-muted-foreground">in period</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Avg Score</CardTitle>
              {avgScore >= 50 ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgScore.toFixed(1)}</div>
              <p className="text-xs text-muted-foreground">out of 100</p>
            </CardContent>
          </Card>
        </div>

        {/* Performance Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Line type="monotone" dataKey="sales" name="Sales ($)" stroke="hsl(var(--primary))" strokeWidth={2} />
                  <Line type="monotone" dataKey="customers" name="Customers" stroke="hsl(var(--accent))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No performance data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance Table */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Performance Records</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Staff</th>
                    <th className="text-left py-2">Date</th>
                    <th className="text-right py-2">Sales</th>
                    <th className="text-right py-2">Customers</th>
                    <th className="text-right py-2">Errors</th>
                    <th className="text-right py-2">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.slice(0, 20).map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="py-2">{p.staff?.first_name} {p.staff?.last_name}</td>
                      <td className="py-2">{format(parseISO(p.date), "MMM d, yyyy")}</td>
                      <td className="py-2 text-right">${Number(p.kpi_sales).toFixed(2)}</td>
                      <td className="py-2 text-right">{p.kpi_customers_served}</td>
                      <td className="py-2 text-right">{p.kpi_errors}</td>
                      <td className="py-2 text-right">{p.score !== null ? Number(p.score).toFixed(1) : "-"}</td>
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
