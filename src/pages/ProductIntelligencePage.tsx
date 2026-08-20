import { useMemo, useState, useEffect } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Info, History, AlertCircle, Check } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocations } from "@/hooks/useLocations";
import { useLocation } from "@/contexts/LocationContext";
import { useHistoricalPeriods, useHistoricalPOSRows } from "@/hooks/useHistoricalPOS";
import { HistoricalCaptivaImportDialog } from "@/components/pos/HistoricalCaptivaImportDialog";
import { useUpdateExternalPOSItem, useBulkUpdateExternalPOSItems } from "@/hooks/usePOS";
import { formatCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useRestaurant } from "@/contexts/RestaurantContext";
import {
  resolveProductClass,
  toStoredClassification,
  PRODUCT_CLASS_LABEL,
  PRODUCT_CLASS_OPTIONS,
  type ProductClass,
} from "@/lib/productClassification";
import { ProductTypeBadge } from "@/components/products/ProductTypeBadge";
import { ProductActionsMenu } from "@/components/products/ProductActionsMenu";
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
  const { data: rows = [] } = useHistoricalPOSRows({
    locationId,
    periodStart: ps,
    periodEnd: pe,
  });

  const { data: catalogue = [] } = useQuery({
    queryKey: ["external-pos-items-catalogue", currentRestaurant?.id, locationId ?? "all"],
    enabled: !!currentRestaurant,
    queryFn: async () => {
      let q = (supabase as any)
        .from("external_pos_items")
        .select(
          "id, location_id, external_item_id, external_item_name, department, display_name, manual_department, mapped_dish_id, needs_review, manual_type, manual_drink_type, archived_at, source",
        )
        .eq("restaurant_id", currentRestaurant!.id);
      if (locationId) q = q.eq("location_id", locationId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

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

  const updateOne = useUpdateExternalPOSItem();
  const bulkUpdate = useBulkUpdateExternalPOSItems();

  const classified = useMemo(() => {
    return rows.map((r) => {
      const cat = catByExt.get(r.external_item_id);
      // Historical rows inherit the CURRENT canonical name / department /
      // classification rather than whatever was captured at import time.
      const department = cat?.manual_department ?? r.department;
      const itemName = cat?.display_name ?? r.item_name;
      const resolved = resolveProductClass({
        department,
        name: itemName,
        manualType: cat?.manual_type ?? null,
        manualDrinkType: cat?.manual_drink_type ?? null,
      });
      const dish = dishByExt.get(r.external_item_id);
      const hasCost =
        !!dish &&
        ((dish.use_direct_cost && Number(dish.direct_cost || 0) > 0) ||
          (dish.has_recipe?.[0]?.count ?? 0) > 0);
      const isNew = cat?.source === "captiva_historical" && !cat?.mapped_dish_id;
      return {
        ...r,
        item_name: itemName,
        department,
        catId: cat?.id as string | undefined,
        cat,
        archived: !!cat?.archived_at,
        productClass: resolved.productClass,
        isManual: resolved.isManual,
        needs_review: !!cat?.needs_review,
        is_new: isNew,
        has_cost: hasCost,
        has_dish: !!dish,
      };
    });
  }, [rows, catByExt, dishByExt]);

  // Archived products stay in historical aggregates (totals below) but are
  // hidden from the working tables unless explicitly shown.
  const [showArchived, setShowArchived] = useState(false);
  const visible = useMemo(
    () => (showArchived ? classified : classified.filter((r) => !r.archived)),
    [classified, showArchived],
  );
  const archivedCount = useMemo(() => classified.filter((r) => r.archived).length, [classified]);

  const totals = useMemo(() => {
    const t = { gross: 0, qty: 0, count: classified.length };
    for (const r of classified) {
      t.gross += Number(r.gross_sales);
      t.qty += Number(r.quantity_sold);
    }
    return t;
  }, [classified]);

  const byType = useMemo(() => {
    const t: Record<string, { gross: number; qty: number }> = {
      food: { gross: 0, qty: 0 },
      alcoholic: { gross: 0, qty: 0 },
      non_alcoholic: { gross: 0, qty: 0 },
      side: { gross: 0, qty: 0 },
      modifier: { gross: 0, qty: 0 },
      other: { gross: 0, qty: 0 },
    };
    for (const r of classified) {
      let bucket = "other";
      if (r.productClass === "food") bucket = "food";
      else if (r.productClass === "side") bucket = "side";
      else if (r.productClass === "modifier") bucket = "modifier";
      else if (r.productClass === "drink_alcoholic") bucket = "alcoholic";
      else if (r.productClass === "drink_non_alcoholic") bucket = "non_alcoholic";
      t[bucket].gross += Number(r.gross_sales);
      t[bucket].qty += Number(r.quantity_sold);
    }
    return t;
  }, [classified]);

  const topByRevenue = useMemo(
    () => [...visible].sort((a, b) => b.gross_sales - a.gross_sales).slice(0, 15),
    [visible],
  );
  const topByQty = useMemo(
    () => [...visible].sort((a, b) => b.quantity_sold - a.quantity_sold).slice(0, 15),
    [visible],
  );
  const lowSellers = useMemo(
    () =>
      [...visible]
        .filter((r) => r.quantity_sold > 0)
        .sort((a, b) => a.quantity_sold - b.quantity_sold)
        .slice(0, 15),
    [visible],
  );
  const newProducts = visible.filter((r) => r.is_new);
  const needsReview = visible.filter((r) => r.needs_review);
  const archivedProducts = classified.filter((r) => r.archived);
  const missingCost = visible.filter(
    (r) => !r.has_cost && r.productClass !== "modifier" && r.productClass !== "other",
  );
  const worthCostingFirst = [...missingCost]
    .sort((a, b) => b.gross_sales - a.gross_sales)
    .slice(0, 15);

  const currentPeriod = periods.find((p) => `${p.period_start}|${p.period_end}` === periodKey);
  const locName = locations.find(
    (l: any) => l.id === (currentPeriod?.location_id || locationId),
  )?.name;

  // Selection is global across tabs (by catalogue id)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const clearSel = () => setSelected(new Set());

  const setRowClassification = (catId: string, c: ProductClass) => {
    updateOne.mutate({ id: catId, ...toStoredClassification(c), needs_review: false });
  };
  const setBulkClassification = async (c: ProductClass) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    await bulkUpdate.mutateAsync({ ids, ...toStoredClassification(c), needs_review: false });
    clearSel();
  };
  const markRowReviewed = async (catId: string) => {
    await updateOne.mutateAsync({ id: catId, needs_review: false });
  };
  const bulkMarkReviewed = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    await bulkUpdate.mutateAsync({ ids, needs_review: false });
    clearSel();
  };

  const renderProductTable = (data: any[], emptyLabel = "No data") => {
    if (!data.length)
      return <div className="p-8 text-center text-sm text-muted-foreground">{emptyLabel}</div>;
    const visibleIds = data.map((r) => r.catId).filter(Boolean) as string[];
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
    const toggleAll = () => {
      setSelected((s) => {
        const n = new Set(s);
        if (allSelected) visibleIds.forEach((id) => n.delete(id));
        else visibleIds.forEach((id) => n.add(id));
        return n;
      });
    };
    return (
      <div className="border rounded mt-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              </TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right w-56">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  {r.catId && (
                    <Checkbox
                      checked={selected.has(r.catId)}
                      onCheckedChange={() => toggleSel(r.catId!)}
                    />
                  )}
                </TableCell>
                <TableCell className="font-medium">{r.item_name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{r.department}</TableCell>
                <TableCell>
                  <ProductTypeBadge
                    value={r.productClass}
                    isManual={r.isManual}
                    disabled={!r.catId || updateOne.isPending}
                    onChange={(c) => r.catId && setRowClassification(r.catId, c)}
                  />
                </TableCell>
                <TableCell className="text-right">{r.quantity_sold}</TableCell>
                <TableCell className="text-right">{formatCurrency(Number(r.gross_sales))}</TableCell>
                <TableCell className="text-xs space-x-1">
                  {r.archived && <Badge variant="outline" className="text-muted-foreground">Archived</Badge>}
                  {r.is_new && <Badge variant="outline">New</Badge>}
                  {r.needs_review && <Badge className="bg-warning/15 text-warning">Review</Badge>}
                  {!r.has_cost && r.productClass !== "modifier" && r.productClass !== "other" && (
                    <Badge variant="outline" className="text-warning border-warning/40">
                      No cost
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {r.catId && r.needs_review && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markRowReviewed(r.catId!)}
                        disabled={updateOne.isPending}
                      >
                        <Check className="h-3 w-3 mr-1" /> Reviewed
                      </Button>
                    )}
                    <ProductActionsMenu
                      item={
                        r.cat
                          ? {
                              id: r.cat.id,
                              external_item_id: r.cat.external_item_id,
                              location_id: r.cat.location_id,
                              mapped_dish_id: r.cat.mapped_dish_id,
                              external_item_name: r.cat.external_item_name,
                              display_name: r.cat.display_name ?? null,
                              department: r.cat.department,
                              manual_department: r.cat.manual_department ?? null,
                              productClass: r.productClass,
                              needs_review: r.needs_review,
                              archived_at: r.cat.archived_at ?? null,
                            }
                          : null
                      }
                      fallbackName={r.item_name}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <PageLayout
      title="Product Intelligence"
      description="Historical aggregate product totals from POS reports"
      action={<HistoricalCaptivaImportDialog defaultLocationId={locationId ?? undefined} />}
    >
      <Alert className="mb-4">
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Historical aggregate data</strong> — period totals, not daily transactions. Does
          not affect daily dashboard, reports, labour %, AOV, or profit. Product types shown here
          are the shared canonical classification: changing one updates Menu Performance too.
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
            <div className="pt-2">
              <HistoricalCaptivaImportDialog defaultLocationId={locationId ?? undefined} />
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="min-w-64">
              <label className="text-xs uppercase text-muted-foreground">Period</label>
              <Select value={periodKey} onValueChange={setPeriodKey}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => {
                    const key = `${p.period_start}|${p.period_end}`;
                    const loc = locations.find((l: any) => l.id === p.location_id)?.name || "";
                    return (
                      <SelectItem key={key} value={key}>
                        {p.period_label || `${p.period_start} → ${p.period_end}`} · {loc} ·{" "}
                        {formatCurrency(p.total_gross)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            {locName && <Badge variant="secondary">{locName}</Badge>}
            {currentPeriod?.period_label && <Badge>{currentPeriod.period_label}</Badge>}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
            <KpiCard title="Total gross" value={formatCurrency(totals.gross)} sub="historical" />
            <KpiCard title="Total qty" value={String(totals.qty)} sub="historical" />
            <KpiCard title="Products" value={String(totals.count)} />
            <KpiCard title="New products" value={String(newProducts.length)} sub="from this import" />
            <KpiCard
              title="Needs review"
              value={String(needsReview.length)}
              tone={needsReview.length ? "warn" : undefined}
            />
            <KpiCard
              title="Missing cost"
              value={String(missingCost.length)}
              tone={missingCost.length ? "warn" : undefined}
            />
          </div>

          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Revenue by type{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (historical aggregate)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <TypeCard label="Food" data={byType.food} />
              <TypeCard label="Alcoholic drinks" data={byType.alcoholic} />
              <TypeCard label="Non-alcoholic" data={byType.non_alcoholic} />
              <TypeCard label="Sides" data={byType.side} />
              <TypeCard label="Modifiers" data={byType.modifier} />
              <TypeCard label="Other / unclassified" data={byType.other} />
            </CardContent>
          </Card>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 p-3 mb-3 border rounded bg-muted/40">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="default" disabled={bulkUpdate.isPending}>
                    Set type for selected
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Classify as</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {PRODUCT_CLASS_OPTIONS.map((c) => (
                    <DropdownMenuItem key={c} onClick={() => setBulkClassification(c)}>
                      {PRODUCT_CLASS_LABEL[c]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                variant="outline"
                onClick={bulkMarkReviewed}
                disabled={bulkUpdate.isPending}
              >
                <Check className="h-3 w-3 mr-1" /> Mark reviewed
              </Button>
              <Button size="sm" variant="ghost" onClick={clearSel}>
                Clear
              </Button>
            </div>
          )}

          <Tabs defaultValue="top-revenue">
            <TabsList>
              <TabsTrigger value="top-revenue">Top by revenue</TabsTrigger>
              <TabsTrigger value="top-qty">Top by qty</TabsTrigger>
              <TabsTrigger value="low">Low sellers</TabsTrigger>
              <TabsTrigger value="new">New products ({newProducts.length})</TabsTrigger>
              <TabsTrigger value="review">Needs review ({needsReview.length})</TabsTrigger>
              <TabsTrigger value="cost">
                Worth costing first ({worthCostingFirst.length})
              </TabsTrigger>
              <TabsTrigger value="all">All ({visible.length})</TabsTrigger>
              <TabsTrigger value="archived">Archived ({archivedCount})</TabsTrigger>
            </TabsList>

            <TabsContent value="archived">
              <Alert className="mb-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Archived products stay attached to historical totals but are hidden from the
                  active views. Restore one from its actions menu.
                </AlertDescription>
              </Alert>
              {renderProductTable(archivedProducts, "No archived products")}
            </TabsContent>

            <TabsContent value="top-revenue">{renderProductTable(topByRevenue)}</TabsContent>
            <TabsContent value="top-qty">{renderProductTable(topByQty)}</TabsContent>
            <TabsContent value="low">{renderProductTable(lowSellers)}</TabsContent>
            <TabsContent value="new">
              {renderProductTable(newProducts, "No new products from this import")}
            </TabsContent>
            <TabsContent value="review">
              {renderProductTable(needsReview, "Nothing awaiting review")}
            </TabsContent>
            <TabsContent value="cost">
              <Alert className="mb-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  High-revenue items with no recipe or direct cost. Prioritise these to improve
                  profit accuracy.
                </AlertDescription>
              </Alert>
              {renderProductTable(worthCostingFirst, "All sellable items have costs configured")}
            </TabsContent>
            <TabsContent value="all">
              {renderProductTable(
                [...classified].sort((a, b) => b.gross_sales - a.gross_sales),
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </PageLayout>
  );
}

function KpiCard({
  title,
  value,
  sub,
  tone,
}: {
  title: string;
  value: string;
  sub?: string;
  tone?: "warn";
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs uppercase text-muted-foreground">{title}</div>
        <div className={`text-xl font-semibold ${tone === "warn" ? "text-warning" : ""}`}>
          {value}
        </div>
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
