import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Minus, Clock, Package, DollarSign, Truck } from "lucide-react";
import { useIngredientPriceHistory, useDeliveryPerformance } from "@/hooks/useSupplierAnalytics";
import { useSuppliers } from "@/hooks/useSuppliers";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";

export function SupplierAnalytics() {
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const { data: suppliers = [] } = useSuppliers();
  const { data: priceHistory = [], isLoading: pricesLoading } = useIngredientPriceHistory(
    selectedSupplier || undefined
  );
  const { data: deliveryPerformance = [], isLoading: deliveryLoading } = useDeliveryPerformance();

  const selectedDelivery = selectedSupplier
    ? deliveryPerformance.find((d) => d.supplier_id === selectedSupplier)
    : null;

  return (
    <div className="space-y-6">
      {/* Supplier Filter */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">Filter by Supplier:</label>
        <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="All Suppliers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Suppliers</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="prices" className="space-y-4">
        <TabsList>
          <TabsTrigger value="prices" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Price History
          </TabsTrigger>
          <TabsTrigger value="delivery" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Delivery Performance
          </TabsTrigger>
        </TabsList>

        {/* Price History Tab */}
        <TabsContent value="prices" className="space-y-4">
          {pricesLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading price history...</div>
          ) : priceHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border rounded-md bg-muted/30">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No purchase order history found</p>
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ingredient</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Latest Price</TableHead>
                    <TableHead className="text-right">Avg Price</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceHistory.map((item) => (
                    <TableRow key={`${item.ingredient_id}-${item.supplier_id}`}>
                      <TableCell className="font-medium">
                        {item.ingredient_name}
                        <span className="text-muted-foreground text-sm ml-1">/{item.unit}</span>
                      </TableCell>
                      <TableCell>{item.supplier_name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(item.latestPrice)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {formatCurrency(item.avgPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        <PriceChangeBadge change={item.priceChange} />
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {item.prices.length}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Delivery Performance Tab */}
        <TabsContent value="delivery" className="space-y-4">
          {deliveryLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading delivery performance...
            </div>
          ) : selectedSupplier && selectedDelivery ? (
            <SingleSupplierDelivery performance={selectedDelivery} />
          ) : (
            <AllSuppliersDelivery performance={deliveryPerformance} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PriceChangeBadge({ change }: { change: number }) {
  if (Math.abs(change) < 0.5) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Minus className="h-3 w-3" />
        Stable
      </Badge>
    );
  }

  if (change > 0) {
    return (
      <Badge variant="destructive" className="gap-1">
        <TrendingUp className="h-3 w-3" />+{change.toFixed(1)}%
      </Badge>
    );
  }

  return (
    <Badge className="gap-1 bg-green-600">
      <TrendingDown className="h-3 w-3" />
      {change.toFixed(1)}%
    </Badge>
  );
}

function AllSuppliersDelivery({
  performance,
}: {
  performance: ReturnType<typeof useDeliveryPerformance>["data"];
}) {
  if (!performance || performance.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground border rounded-md bg-muted/30">
        <Truck className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No delivery data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Suppliers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{performance.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {performance.reduce((sum, p) => sum + p.total_orders, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Delivery Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(
                performance.reduce((sum, p) => sum + p.avg_delay_days, 0) / performance.length
              ).toFixed(1)}{" "}
              days
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg On-Time Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(
                performance.reduce((sum, p) => sum + p.on_time_percentage, 0) / performance.length
              ).toFixed(0)}
              %
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Supplier Table */}
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Avg Delay</TableHead>
              <TableHead className="text-right">On-Time</TableHead>
              <TableHead className="text-right">Late</TableHead>
              <TableHead className="text-right">On-Time %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {performance.map((p) => (
              <TableRow key={p.supplier_id}>
                <TableCell className="font-medium">{p.supplier_name}</TableCell>
                <TableCell className="text-right">{p.total_orders}</TableCell>
                <TableCell className="text-right">{p.received_orders}</TableCell>
                <TableCell className="text-right">
                  <span className="font-mono">{p.avg_delay_days.toFixed(1)}</span>
                  <span className="text-muted-foreground text-sm ml-1">days</span>
                </TableCell>
                <TableCell className="text-right text-green-600 font-medium">
                  {p.on_time_count}
                </TableCell>
                <TableCell className="text-right text-red-600 font-medium">{p.late_count}</TableCell>
                <TableCell className="text-right">
                  <OnTimePercentageBadge percentage={p.on_time_percentage} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SingleSupplierDelivery({
  performance,
}: {
  performance: ReturnType<typeof useDeliveryPerformance>["data"][0];
}) {
  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{performance.total_orders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Received</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{performance.received_orders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Delivery Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{performance.avg_delay_days.toFixed(1)} days</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">On-Time Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{performance.on_time_percentage.toFixed(0)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Deliveries */}
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order Date</TableHead>
              <TableHead>Received</TableHead>
              <TableHead className="text-right">Delay</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {performance.deliveries.slice(0, 20).map((d) => (
              <TableRow key={d.po_id}>
                <TableCell>{format(new Date(d.order_date), "MMM d, yyyy")}</TableCell>
                <TableCell>
                  {d.received_at ? format(new Date(d.received_at), "MMM d, yyyy") : "-"}
                </TableCell>
                <TableCell className="text-right">
                  {d.received_at ? (
                    <span
                      className={`font-mono ${d.delay_days > 3 ? "text-red-600" : "text-green-600"}`}
                    >
                      {d.delay_days} days
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      d.status === "received"
                        ? "default"
                        : d.status === "pending"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {d.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function OnTimePercentageBadge({ percentage }: { percentage: number }) {
  if (percentage >= 80) {
    return <Badge className="bg-green-600">{percentage.toFixed(0)}%</Badge>;
  }
  if (percentage >= 50) {
    return <Badge className="bg-amber-500">{percentage.toFixed(0)}%</Badge>;
  }
  return <Badge variant="destructive">{percentage.toFixed(0)}%</Badge>;
}
