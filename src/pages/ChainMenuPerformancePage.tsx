import { useMemo, useState } from 'react';
import { PageLayout } from '@/components/common/PageLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useDishes } from '@/hooks/useDishes';
import { useSales } from '@/hooks/useSales';
import {
  useAllExternalPOSItems,
  useBulkUpdateExternalPOSItems,
  useUpdateExternalPOSItem,
  type ExternalPOSItem,
} from '@/hooks/usePOS';
import { useDateRange } from '@/contexts/DateRangeContext';
import { DateRangeSelector } from '@/components/DateRangeSelector';
import { useLocation } from '@/contexts/LocationContext';
import { useLocations } from '@/hooks/useLocations';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, parseISO } from 'date-fns';
import { CalendarIcon, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Lightbulb, Check, ChevronDown } from 'lucide-react';
import { formatCurrency, currencySymbol } from '@/lib/currency';
import {
  inferItemType,
  inferDrinkType,
  ITEM_TYPE_LABEL,
  DRINK_TYPE_LABEL,
  type PosItemType,
  type DrinkType,
} from '@/lib/posItemClassification';

type StatusFilter = 'all' | 'mapped' | 'unmapped' | 'auto-review';
type BucketTab = 'sold' | 'zero' | 'review' | 'modifiers' | 'all';
type TypeFilter =
  | 'all'
  | 'food'
  | 'drink'
  | 'drink_alcoholic'
  | 'drink_non_alcoholic'
  | 'modifier'
  | 'other';
type ChartMode = 'food_drink' | 'food' | 'drink' | 'alcoholic' | 'non_alcoholic';

interface Row {
  id: string;
  extId: string | null;
  name: string;
  department: string | null;
  itemType: PosItemType;
  inferredType: PosItemType;
  manualType: PosItemType | null;
  drinkType: DrinkType;              // effective when itemType === 'drink'
  manualDrinkType: DrinkType | null;
  quantity: number;
  revenue: number;
  basePrice: number;
  category: string | null;
  needsReview: boolean;
}

export default function ChainMenuPerformancePage() {
  const { startDate, endDate, presetLabel, preset, setCustomRange } = useDateRange();
  const { selectedLocationId } = useLocation();
  const { data: locations = [] } = useLocations();
  const activeLocation = locations.find((l) => l.id === selectedLocationId);
  const locationLabel = activeLocation?.name ?? 'All locations';
  const [reportDateOpen, setReportDateOpen] = useState(false);
  const { data: dishes } = useDishes();
  const { data: sales } = useSales(startDate, endDate);
  const { data: extItems } = useAllExternalPOSItems();
  const updateOne = useUpdateExternalPOSItem();
  const bulkUpdate = useBulkUpdateExternalPOSItems();

  const [tab, setTab] = useState<BucketTab>('sold');
  const [includeModifiers, setIncludeModifiers] = useState(false);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [chartMode, setChartMode] = useState<ChartMode>('food_drink');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const extByDish = useMemo(() => {
    const map = new Map<string, ExternalPOSItem>();
    (extItems || []).forEach((e) => {
      if (!e.mapped_dish_id) return;
      const existing = map.get(e.mapped_dish_id);
      if (!existing || (!existing.department && e.department)) {
        map.set(e.mapped_dish_id, e);
      }
    });
    return map;
  }, [extItems]);

  const rows: Row[] = useMemo(() => {
    if (!dishes) return [];
    return dishes.map((dish) => {
      const dishSales = (sales || []).filter((s) => s.dish_id === dish.id);
      const qty = dishSales.reduce((sum, s) => sum + s.quantity, 0);
      const rev = dishSales.reduce((sum, s) => sum + Number(s.total_price), 0);
      const ext = extByDish.get(dish.id);
      const dept = ext?.department ?? null;
      const inferred = inferItemType(dept, dish.name);
      const manual = (ext?.manual_type ?? null) as PosItemType | null;
      const itemType = manual ?? inferred;
      const manualDrink = (ext?.manual_drink_type ?? null) as DrinkType | null;
      const drinkType: DrinkType =
        itemType === 'drink' ? manualDrink ?? inferDrinkType(dept, dish.name) : 'unknown';
      return {
        id: dish.id,
        extId: ext?.id ?? null,
        name: dish.name,
        department: dept,
        itemType,
        inferredType: inferred,
        manualType: manual,
        drinkType,
        manualDrinkType: manualDrink,
        quantity: qty,
        revenue: rev,
        basePrice: dish.selling_price,
        category: dish.category,
        needsReview: ext?.needs_review ?? false,
      };
    });
  }, [dishes, sales, extByDish]);

  const buckets = useMemo(() => {
    const modifiers = rows.filter((r) => r.itemType === 'modifier');
    const nonMod = rows.filter((r) => r.itemType !== 'modifier');
    const sold = nonMod.filter((r) => r.quantity > 0);
    const zero = nonMod.filter((r) => r.quantity === 0);
    const review = rows.filter((r) => r.needsReview);
    const alcoholic = rows.filter((r) => r.itemType === 'drink' && r.drinkType === 'alcoholic');
    const nonAlcoholic = rows.filter((r) => r.itemType === 'drink' && r.drinkType === 'non_alcoholic');
    return {
      sold: sold.length,
      zero: zero.length,
      review: review.length,
      modifiers: modifiers.length,
      alcoholic: alcoholic.length,
      nonAlcoholic: nonAlcoholic.length,
      all: rows.length,
    };
  }, [rows]);

  const underperformers = useMemo(() => {
    const peers = rows.filter((r) => (r.itemType === 'food' || r.itemType === 'drink') && r.quantity > 0);
    if (peers.length < 4) return [] as Row[];
    const qtys = peers.map((r) => r.quantity).sort((a, b) => a - b);
    const q1 = qtys[Math.floor(qtys.length * 0.25)];
    const threshold = Math.max(3, q1);
    return peers.filter((r) => r.quantity < threshold);
  }, [rows]);

  const matchesTypeFilter = (r: Row): boolean => {
    switch (typeFilter) {
      case 'all': return true;
      case 'food': return r.itemType === 'food';
      case 'drink': return r.itemType === 'drink';
      case 'drink_alcoholic': return r.itemType === 'drink' && r.drinkType === 'alcoholic';
      case 'drink_non_alcoholic': return r.itemType === 'drink' && r.drinkType === 'non_alcoholic';
      case 'modifier': return r.itemType === 'modifier';
      case 'other': return r.itemType === 'other';
    }
  };

  const filtered = useMemo(() => {
    let list = rows;
    if (tab === 'sold') list = list.filter((r) => r.quantity > 0 && r.itemType !== 'modifier');
    else if (tab === 'zero') list = list.filter((r) => r.quantity === 0 && r.itemType !== 'modifier');
    else if (tab === 'review') list = list.filter((r) => r.needsReview);
    else if (tab === 'modifiers') list = list.filter((r) => r.itemType === 'modifier');

    if (!includeModifiers && tab !== 'modifiers' && tab !== 'all' && typeFilter !== 'modifier') {
      list = list.filter((r) => r.itemType !== 'modifier');
    }

    list = list.filter(matchesTypeFilter);

    if (status === 'mapped') list = list.filter((r) => !!r.extId && !r.needsReview);
    else if (status === 'unmapped') list = list.filter((r) => !r.extId);
    else if (status === 'auto-review') list = list.filter((r) => r.needsReview);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) => r.name.toLowerCase().includes(q) || (r.department || '').toLowerCase().includes(q),
      );
    }

    return [...list].sort((a, b) => b.revenue - a.revenue);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tab, includeModifiers, typeFilter, status, search]);

  const visibleRows = filtered.slice(0, 100);
  const visibleExtIds = visibleRows.map((r) => r.extId).filter((x): x is string => !!x);
  const allVisibleSelected = visibleExtIds.length > 0 && visibleExtIds.every((id) => selected.has(id));

  const toggleRow = (extId: string | null) => {
    if (!extId) return;
    const next = new Set(selected);
    if (next.has(extId)) next.delete(extId); else next.add(extId);
    setSelected(next);
  };

  const toggleAllVisible = () => {
    const next = new Set(selected);
    if (allVisibleSelected) visibleExtIds.forEach((id) => next.delete(id));
    else visibleExtIds.forEach((id) => next.add(id));
    setSelected(next);
  };

  const bulkMarkReviewed = async () => {
    const ids = visibleExtIds.filter((id) => rows.find((r) => r.extId === id)?.needsReview);
    if (!ids.length) return;
    await bulkUpdate.mutateAsync({ ids, needs_review: false });
  };

  const bulkSetType = async (t: PosItemType) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    await bulkUpdate.mutateAsync({ ids, manual_type: t, needs_review: false });
    setSelected(new Set());
  };

  // Set as Alcoholic / Non-Alcoholic Drink in one action (type + subtype)
  const bulkSetDrink = async (subtype: DrinkType) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    await bulkUpdate.mutateAsync({
      ids,
      manual_type: 'drink',
      manual_drink_type: subtype,
      needs_review: false,
    });
    setSelected(new Set());
  };

  const chartData = useMemo(() => {
    const pool = rows.filter((r) => {
      if (r.quantity <= 0) return false;
      if (r.itemType === 'modifier') return includeModifiers && chartMode === 'food_drink';
      switch (chartMode) {
        case 'food_drink': return r.itemType === 'food' || r.itemType === 'drink';
        case 'food': return r.itemType === 'food';
        case 'drink': return r.itemType === 'drink';
        case 'alcoholic': return r.itemType === 'drink' && r.drinkType === 'alcoholic';
        case 'non_alcoholic': return r.itemType === 'drink' && r.drinkType === 'non_alcoholic';
      }
    });
    return pool
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
      .map((r) => ({ name: r.name.substring(0, 18), revenue: r.revenue, quantity: r.quantity }));
  }, [rows, includeModifiers, chartMode]);

  const topPerformer = chartData[0]?.name || '-';

  const recommendations = useMemo(() => {
    const recs: string[] = [];
    if (buckets.review > 0) recs.push(`${buckets.review} auto-created item(s) still need review — use bulk actions to speed this up.`);
    if (underperformers.length > 0) recs.push(`${underperformers.length} sold food/drink item(s) fall below the peer sales threshold.`);
    if (buckets.zero > 0) recs.push(`${buckets.zero} item(s) had zero sales in this period. Check active menus.`);
    return recs;
  }, [buckets, underperformers]);

  return (
    <PageLayout title="Chain Menu Performance" description="Compare dish performance across all locations">
      <div className="space-y-6">
        <div className="text-sm text-muted-foreground">
          Showing data for: <span className="font-medium text-foreground">{presetLabel}</span>
          {startDate !== endDate && <span> ({startDate} → {endDate})</span>}
        </div>

        <div className="grid gap-4 md:grid-cols-6">
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Items</p><p className="text-2xl font-bold">{buckets.all}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Sold</p><p className="text-2xl font-bold text-green-600">{buckets.sold}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Zero-sale</p><p className="text-2xl font-bold text-muted-foreground">{buckets.zero}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Needs Review</p><p className="text-2xl font-bold text-yellow-500">{buckets.review}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Alcoholic</p><p className="text-2xl font-bold">{buckets.alcoholic}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Non-alcoholic</p><p className="text-2xl font-bold">{buckets.nonAlcoholic}</p></CardContent></Card>
        </div>

        {recommendations.length > 0 && (
          <Card className="border-primary/50 bg-primary/5">
            <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-primary" /> Recommendations</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2"><span className="text-primary">•</span><span>{r}</span></li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Top Items by Revenue</CardTitle>
              <CardDescription>
                Top performer: <span className="font-medium text-foreground">{topPerformer}</span>
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Select value={chartMode} onValueChange={(v) => setChartMode(v as ChartMode)}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="food_drink">Food + Drink</SelectItem>
                  <SelectItem value="food">Food only</SelectItem>
                  <SelectItem value="drink">All drinks</SelectItem>
                  <SelectItem value="alcoholic">Alcoholic drinks only</SelectItem>
                  <SelectItem value="non_alcoholic">Non-alcoholic drinks only</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Switch id="chart-mods" checked={includeModifiers} onCheckedChange={setIncludeModifiers} />
                <Label htmlFor="chart-mods" className="text-sm">Include modifiers</Label>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'hsl(var(--foreground))' }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" name={`Revenue (${currencySymbol})`} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="quantity" fill="hsl(var(--chart-2))" name="Quantity" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Item Performance</CardTitle>
            <CardDescription>Individual Captiva products with type inferred from department</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={tab} onValueChange={(v) => setTab(v as BucketTab)}>
              <TabsList>
                <TabsTrigger value="sold">Sold ({buckets.sold})</TabsTrigger>
                <TabsTrigger value="zero">Zero-sale ({buckets.zero})</TabsTrigger>
                <TabsTrigger value="review">Needs review ({buckets.review})</TabsTrigger>
                <TabsTrigger value="modifiers">Modifiers ({buckets.modifiers})</TabsTrigger>
                <TabsTrigger value="all">All ({buckets.all})</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-3">
              <Input placeholder="Search name or department…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Item type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="food">Food only</SelectItem>
                  <SelectItem value="drink">All drinks</SelectItem>
                  <SelectItem value="drink_alcoholic">Alcoholic drinks</SelectItem>
                  <SelectItem value="drink_non_alcoholic">Non-alcoholic drinks</SelectItem>
                  <SelectItem value="modifier">Modifiers / sides</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Mapping status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="mapped">Mapped</SelectItem>
                  <SelectItem value="auto-review">Auto-created (review)</SelectItem>
                  <SelectItem value="unmapped">Unmapped</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 ml-auto">
                <Switch id="tbl-mods" checked={includeModifiers} onCheckedChange={setIncludeModifiers} />
                <Label htmlFor="tbl-mods" className="text-sm">Include modifiers</Label>
              </div>
            </div>

            {/* Bulk action bar */}
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
              <span className="text-sm text-muted-foreground pl-1">{selected.size} selected</span>
              <div className="flex-1" />
              <Button size="sm" variant="outline" onClick={bulkMarkReviewed} disabled={bulkUpdate.isPending}>
                <Check className="h-4 w-4 mr-1" /> Mark visible as reviewed
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={selected.size === 0 || bulkUpdate.isPending}>
                    Set type <ChevronDown className="h-4 w-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Apply to {selected.size} item(s)</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => bulkSetType('food')}>Food</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => bulkSetDrink('alcoholic')}>Alcoholic drink</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => bulkSetDrink('non_alcoholic')}>Non-alcoholic drink</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => bulkSetType('modifier')}>Modifier / Side</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => bulkSetType('other')}>Other</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="w-8 py-3 px-2">
                      <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} aria-label="Select all visible" />
                    </th>
                    <th className="text-left py-3 px-2">Product</th>
                    <th className="text-left py-3 px-2">Department</th>
                    <th className="text-left py-3 px-2">Type</th>
                    <th className="text-left py-3 px-2">Alcohol</th>
                    <th className="text-right py-3 px-2">Qty</th>
                    <th className="text-right py-3 px-2">Revenue</th>
                    <th className="text-right py-3 px-2">Price</th>
                    <th className="text-center py-3 px-2">Status</th>
                    <th className="text-right py-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => {
                    const isUnder = underperformers.some((u) => u.id === r.id);
                    const isSelected = r.extId ? selected.has(r.extId) : false;
                    return (
                      <tr key={r.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-2">
                          <Checkbox checked={isSelected} disabled={!r.extId} onCheckedChange={() => toggleRow(r.extId)} aria-label={`Select ${r.name}`} />
                        </td>
                        <td className="py-3 px-2">
                          <p className="font-medium">{r.name}</p>
                          {r.category && <p className="text-xs text-muted-foreground">{r.category}</p>}
                        </td>
                        <td className="py-3 px-2 text-muted-foreground">
                          {r.department || <span className="italic">—</span>}
                        </td>
                        <td className="py-3 px-2">
                          <Badge variant="outline" className="capitalize">
                            {ITEM_TYPE_LABEL[r.itemType]}
                            {r.manualType && <span className="ml-1 text-[10px] opacity-70">(set)</span>}
                          </Badge>
                        </td>
                        <td className="py-3 px-2">
                          {r.itemType === 'drink' ? (
                            <Badge
                              variant="outline"
                              className={
                                r.drinkType === 'alcoholic'
                                  ? 'bg-purple-500/15 text-purple-600 border-purple-500/30'
                                  : r.drinkType === 'non_alcoholic'
                                  ? 'bg-sky-500/15 text-sky-600 border-sky-500/30'
                                  : ''
                              }
                            >
                              {DRINK_TYPE_LABEL[r.drinkType]}
                              {r.manualDrinkType && <span className="ml-1 text-[10px] opacity-70">(set)</span>}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-right">{r.quantity}</td>
                        <td className="py-3 px-2 text-right font-medium">{formatCurrency(r.revenue)}</td>
                        <td className="py-3 px-2 text-right">{formatCurrency(r.basePrice)}</td>
                        <td className="py-3 px-2 text-center">
                          <div className="flex flex-col items-center gap-1">
                            {r.needsReview ? (
                              <Badge className="bg-yellow-500/20 text-yellow-600">Needs review</Badge>
                            ) : (
                              <Badge variant="secondary">Reviewed</Badge>
                            )}
                            {r.quantity === 0 ? (
                              <Badge variant="outline" className="text-muted-foreground">No sales</Badge>
                            ) : isUnder ? (
                              <Badge variant="destructive"><TrendingDown className="h-3 w-3 mr-1" />Underperforming</Badge>
                            ) : (
                              <Badge className="bg-green-500/20 text-green-600"><TrendingUp className="h-3 w-3 mr-1" />Selling</Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-2 text-right">
                          {r.extId && r.needsReview && (
                            <Button size="sm" variant="ghost" onClick={() => updateOne.mutate({ id: r.extId!, needs_review: false })} disabled={updateOne.isPending}>
                              Mark reviewed
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="text-center py-8 text-muted-foreground">
                        No items match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {filtered.length > 100 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Showing top 100 of {filtered.length} matching items.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
