import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCashFlowSummary } from "@/hooks/useFinancialReports";
import { formatCurrency } from "@/lib/currency";
import { Loader2, ArrowUpCircle, ArrowDownCircle, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";

export function CashFlowReport() {
  const { data: cashFlowData = [], isLoading } = useCashFlowSummary(6);

  // Calculate totals
  const totals = cashFlowData.reduce(
    (acc, row) => ({
      cashIn: acc.cashIn + row.cashIn,
      cashOutPayroll: acc.cashOutPayroll + row.cashOutPayroll,
      cashOutOverheads: acc.cashOutOverheads + row.cashOutOverheads,
      cashOutTotal: acc.cashOutTotal + row.cashOutTotal,
      netCashFlow: acc.netCashFlow + row.netCashFlow,
    }),
    { cashIn: 0, cashOutPayroll: 0, cashOutOverheads: 0, cashOutTotal: 0, netCashFlow: 0 }
  );

  // Prepare chart data
  const chartData = cashFlowData.map((row) => ({
    month: row.month,
    "Cash In": row.cashIn,
    "Cash Out": -row.cashOutTotal,
    "Net Flow": row.netCashFlow,
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowUpCircle className="h-4 w-4 text-success" />
              Total Cash In
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{formatCurrency(totals.cashIn)}</div>
            <p className="text-xs text-muted-foreground">From sales revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowDownCircle className="h-4 w-4 text-destructive" />
              Payroll Expense
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatCurrency(totals.cashOutPayroll)}</div>
            <p className="text-xs text-muted-foreground">Staff wages</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowDownCircle className="h-4 w-4 text-destructive" />
              Overhead Expense
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatCurrency(totals.cashOutOverheads)}</div>
            <p className="text-xs text-muted-foreground">Fixed costs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Net Cash Flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", totals.netCashFlow >= 0 ? "text-success" : "text-destructive")}>
              {formatCurrency(totals.netCashFlow)}
            </div>
            <p className="text-xs text-muted-foreground">Last 6 months</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Cash Flow Trend</CardTitle>
          <CardDescription>Monthly cash inflows and outflows</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No data available</p>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} className="text-xs" />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(Math.abs(value))}
                    labelClassName="font-medium"
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  />
                  <Legend />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                  <Bar dataKey="Cash In" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Cash Out" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Cash Flow Summary</CardTitle>
          <CardDescription>Detailed breakdown of cash movements</CardDescription>
        </CardHeader>
        <CardContent>
          {cashFlowData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No data available</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Cash In (Sales)</TableHead>
                  <TableHead className="text-right">Payroll</TableHead>
                  <TableHead className="text-right">Overheads</TableHead>
                  <TableHead className="text-right">Total Out</TableHead>
                  <TableHead className="text-right">Net Cash Flow</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashFlowData.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium">{row.month}</TableCell>
                    <TableCell className="text-right text-success">{formatCurrency(row.cashIn)}</TableCell>
                    <TableCell className="text-right text-destructive">{formatCurrency(row.cashOutPayroll)}</TableCell>
                    <TableCell className="text-right text-destructive">{formatCurrency(row.cashOutOverheads)}</TableCell>
                    <TableCell className="text-right text-destructive">{formatCurrency(row.cashOutTotal)}</TableCell>
                    <TableCell className={cn("text-right font-medium", row.netCashFlow >= 0 ? "text-success" : "text-destructive")}>
                      {formatCurrency(row.netCashFlow)}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals Row */}
                <TableRow className="bg-muted/50 font-medium">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right text-success">{formatCurrency(totals.cashIn)}</TableCell>
                  <TableCell className="text-right text-destructive">{formatCurrency(totals.cashOutPayroll)}</TableCell>
                  <TableCell className="text-right text-destructive">{formatCurrency(totals.cashOutOverheads)}</TableCell>
                  <TableCell className="text-right text-destructive">{formatCurrency(totals.cashOutTotal)}</TableCell>
                  <TableCell className={cn("text-right", totals.netCashFlow >= 0 ? "text-success" : "text-destructive")}>
                    {formatCurrency(totals.netCashFlow)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
