import { useMemo, useState, useEffect } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Info, History, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocations } from "@/hooks/useLocations";
import { useLocation } from "@/contexts/LocationContext";
import { useHistoricalPeriods, useHistoricalPOSRows } from "@/hooks/useHistoricalPOS";
import { HistoricalCaptivaImportDialog } from "@/components/pos/HistoricalCaptivaImportDialog";
import { formatCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { inferItemType, inferDrinkType } from "@/lib/posItemClassification";
import { Button } from "@/components/ui/button";

export default function ProductIntelligencePage() {
  const { data: locations = [] } = useLocations();
  const { selectedLocationId } = useLocation();
  const { currentRestaurant } = useRestaurant();
  const locationId = selectedLocationId || null;

  const { data: periods = [] } = useHistoricalPeriods(locationId);
  const [periodKey, setPeriodKey] = useState<string>("");

  useEffect(() => {
    if (!periodKey && periods.length) {
      const p = periods[0];
      setPeriodKey(`${p.period_start}|${p.period_end}`);
    }
  }, [periods, periodKey]);

  const [ps, pe] = periodKey ? periodKey.split("|") : [null, null];
  const { data: rows = [], isLoading } = useHistoricalPOSRows({
    locationId,
    periodStart: ps,
    periodEnd: pe,
  });

  // External POS items catalogue — for review status & mapping detection
  const { data: catalogue = [] } = useQuery({
    queryKey: ["external-pos-items-catalogue", currentRestaurant?.id, locationId ?? "all"],
    enabled: !!currentRestaurant,
    queryFn: async () => {
      let q = supabase
        .from("external_pos_items")
        .select("external_item_id, mapped_dish_id, needs_review, manual_type, manual_drink_type, source")
        .eq("restaurant_id", currentRestaurant!.id);
      if (locationId) q = q.eq("location_id", locationId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // Dishes with cost info (for "missing cost" flag)
  const { data: dishes = [] } = useQuery({
    queryKey: ["dishes-for-intel", currentRestaurant?.id],
    enabled: !!currentRestaurant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dishes")
        .select("id, captiva_external_id, use_direct_cost, direct_cost, has_recipe:dish_ingredients(count)")
        .eq("restaurant_id", currentRestaurant!.id);
      if (error) throw error;
      return data || [];
    },
  });

  const catByExt = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of catalogue) m.set(c.external_item_id, c);
    return m;
  }, [catalogue]);

  const dishByExt = useMemo(() => {
    const m = new Map<string, any>();
    for (const d of dishes) if (d.captiva_external_id) m.set(d.captiva_external_id, d);
    return m;
  }, [dishes]);

  const classified = useMemo(() => {
    return rows.map((r) => {
      const cat = catByExt.get(r.external_item_id);
      const explicitType = cat?.manual_type as string | undefined;
      const type = explicitType || inferItemType(r.department, r.item_name);
      const drink = cat?.manual_drink_type || (type === "drink" ? inferDrinkType(r.department, r.item_name) : "unknown");
      const dish = dishByExt.get(r.external_item_id);
      const hasCost = !!dish && (
        (dish.use_direct_cost && Number(dish.direct_cost || 0) > 0) ||
        ((dish.has_recipe?.[0]?.count ?? 0) > 0)
      );
      const isNew = cat?.source === "captiva_historical" && !cat?.mapped_dish_id;
      return {
        ...r,
        type,
        drink,
        needs_review: !!cat?.needs_review,
        is_new: isNew,
        has_cost: hasCost,
        has_dish: !!dish,
      };
    });
  }, [rows, catByExt, dishByExt]);

  const totals = useMemo(() => {
    const t = { gross: 0, qty: 0, count: classified.length };
    for (const r of classified) { t.gross += Number(r.gross_sales); t.qty += Number(r.quantity_sold); }
    return t;
  }, [classified]);

  const byType = useMemo(() => {
    const t: Record<string, { gross: number; qty: number }> = {
      food: { gross: 0, qty: 0 },
      alcoholic: { gross: 0, qty: 0 },
      non_alcoholic: { gross: 0, qty: 0 },
      modifier: { gross: 0, qty: 0 },
      other: { gross: 0, qty: 0 },
    };
    for (const r of classified) {
      let bucket = "other";
      if (r.type === "food") bucket = "food";
      else if (r.type === "modifier") bucket = "modifier";
      else if (r.type === "drink") bucket = r.drink === "alcoholic" ? "alcoholic" : r.drink === "non_alcoholic" ? "non_alcoholic" : "other";
      t[bucket].gross += Number(r.gross_sales);
      t[bucket].qty += Number(r.quantity_sold);
    }
    return t;
  }, [classified]);

  const topByRevenue = useMemo(() => [...classified].sort((a, b) => b.gross_sales - a.gross_sales).slice(0, 15), [classified]);
  const topByQty = useMemo(() => [...classified].sort((a, b) => b.quantity_sold - a.quantity_sold).slice(0, 15), [classified]);
  const lowSellers = useMemo(
    () => [...classified].filter((r) => r.quantity_sold > 0).sort((a, b) => a.quantity_sold - b.quantity_sold).slice(0, 15),
    [classified],
  );
  const newProducts = classified.filter((r) => r.is_new);
  const needsReview = classified.filter((r) => r.needs_review);
  const missingCost = classified.filter((r) => !r.has_cost && r.type !== "modifier" && r.type !== "other");
  const worthCostingFirst = [...missingCost].sort((a, b) => b.gross_sales - a.gross_sales).slice(0, 15);

  const currentPeriod = periods.find((p) => `${p.period_start}|${p.period_end}` === periodKey);
  const locName = locations.find((l: any) => l.id === (currentPeriod?.location_id || locationId))?.name;

  return (
    <PageLayout
      title="Product Intelligence"
      description="Historical aggregate product totals from POS reports"
      action={<HistoricalCaptivaImportDialog defaultLocationId={locationId ?? undefined} />}
    >
      <Alert className="mb-4">
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Historical aggregate data</strong> — period totals, not daily transactions.
          Does not affect daily dashboard, reports, labour %, AOV, or profit.
        </AlertDescription>
      </Alert>

      {!periods.length ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <History className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="font-medium">No historical reports imported yet</p>
            <p className="text-sm text-muted-foreground">
              Import a yearly / period Captiva product report to unlock Product Intelligence.
            </p>
            <div className="pt-2"><HistoricalCaptivaImportDialog defaultLocationId={locationId ?? undefined} /></div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="min-w-64">
              <label className="text-xs uppercase text-muted-foreground">Period</label>
              <Select value={periodKey} onValueChange={setPeriodKey}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {periods.map((p) => {
                    const key = `${p.period_start}|${p.period_end}`;
                    const loc = locations.find((l: any) => l.id === p.location_id)?.name || "";
                    return (
                      <SelectItem key={key} value={key}>
                        {p.period_label || `${p.period_start} → ${p.period_end}`} · {loc} · {formatCurrency(p.total_gross)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            {locName && <Badge variant="secondary">{locName}</Badge>}
            {currentPeriod?.period_label && <Badge>{currentPeriod.period_label}</Badge>}
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
            <KpiCard title="Total gross" value={formatCurrency(totals.gross)} sub="historical" />
            <KpiCard title="Total qty" value={String(totals.qty)} sub="historical" />
            <KpiCard title="Products" value={String(totals.count)} />
            <KpiCard title="New products" value={String(newProducts.length)} sub="from this import" />
            <KpiCard title="Needs review" value={String(needsReview.length)} tone={needsReview.length ? "warn" : undefined} />
            <KpiCard title="Missing cost" value={String(missingCost.length)} tone={missingCost.length ? "warn" : undefined} />
          </div>

          {/* Revenue by type */}
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Revenue by type <span className="text-xs font-normal text-muted-foreground">(historical aggregate)</span></CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <TypeCard label="Food" data={byType.food} />
              <TypeCard label="Alcoholic drinks" data={byType.alcoholic} />
              <TypeCard label="Non-alcoholic" data={byType.non_alcoholic} />
              <TypeCard label="Modifiers / sides" data={byType.modifier} />
              <TypeCard label="Other / unclassified" data={byType.other} />
            </CardContent>
          </Card>

          <Tabs defaultValue="top-revenue">
            <TabsList>
              <TabsTrigger value="top-revenue">Top by revenue</TabsTrigger>
              <TabsTrigger value="top-qty">Top by qty</TabsTrigger>
              <TabsTrigger value="low">Low sellers</TabsTrigger>
              <TabsTrigger value="new">New products ({newProducts.length})</TabsTrigger>
              <TabsTrigger value="review">Needs review ({needsReview.length})</TabsTrigger>
              <TabsTrigger value="cost">Worth costing first ({worthCostingFirst.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="top-revenue"><ProductTable rows={topByRevenue} /></TabsContent>
            <TabsContent value="top-qty"><ProductTable rows={topByQty} /></TabsContent>
            <TabsContent value="low"><ProductTable rows={lowSellers} /></TabsContent>
            <TabsContent value="new"><ProductTable rows={newProducts} emptyLabel="No new products from this import" /></TabsContent>
            <TabsContent value="review"><ProductTable rows={needsReview} emptyLabel="Nothing awaiting review" /></TabsContent>
            <TabsContent value="cost">
              <Alert className="mb-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  High-revenue items with no recipe or direct cost. Prioritise these to improve profit accuracy.
                </AlertDescription>
              </Alert>
              <ProductTable rows={worthCostingFirst} emptyLabel="All sellable items have costs configured" />
            </TabsContent>
          </Tabs>
        </>
      )}
    </PageLayout>
  );
}

function KpiCard({ title, value, sub, tone }: { title: string; value: string; sub?: string; tone?: "warn" }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs uppercase text-muted-foreground">{title}</div>
        <div className={`text-xl font-semibold ${tone === "warn" ? "text-warning" : ""}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function TypeCard({ label, data }: { label: string; data: { gross: number; qty: number } }) {
  return (
    <div className="p-3 border rounded">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{formatCurrency(data.gross)}</div>
      <div className="text-xs text-muted-foreground">Qty {data.qty}</div>
    </div>
  );
}

function ProductTable({ rows, emptyLabel = "No data" }: { rows: any[]; emptyLabel?: string }) {
  if (!rows.length) return <div className="p-8 text-center text-sm text-muted-foreground">{emptyLabel}</div>;
  return (
    <div className="border rounded mt-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Gross</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.item_name}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{r.department}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="text-xs">
                  {r.type === "drink" ? (r.drink === "alcoholic" ? "Alcoholic" : r.drink === "non_alcoholic" ? "Non-alc" : "Drink") : r.type}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{r.quantity_sold}</TableCell>
              <TableCell className="text-right">{formatCurrency(Number(r.gross_sales))}</TableCell>
              <TableCell className="text-xs space-x-1">
                {r.is_new && <Badge variant="outline">New</Badge>}
                {r.needs_review && <Badge className="bg-warning/15 text-warning">Review</Badge>}
                {!r.has_cost && r.type !== "modifier" && r.type !== "other" && (
                  <Badge variant="outline" className="text-warning border-warning/40">No cost</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
