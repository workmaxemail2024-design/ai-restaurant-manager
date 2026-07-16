import { useMemo, useState } from 'react';
import { PageLayout } from '@/components/common/PageLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useDishes } from '@/hooks/useDishes';
import { useLocations } from '@/hooks/useLocations';
import { useSales } from '@/hooks/useSales';
import { useAllExternalPOSItems } from '@/hooks/usePOS';
import { useDateRange } from '@/contexts/DateRangeContext';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Lightbulb } from 'lucide-react';
import { formatCurrency, currencySymbol } from '@/lib/currency';
import { inferItemType, ITEM_TYPE_LABEL, type PosItemType } from '@/lib/posItemClassification';

type StatusFilter = 'all' | 'mapped' | 'unmapped' | 'auto-review';
type BucketTab = 'sold' | 'zero' | 'review' | 'modifiers' | 'all';

interface Row {
  id: string;                // dish id (or external id if unmapped)
  name: string;
  department: string | null;
  itemType: PosItemType;
  quantity: number;
  revenue: number;
  basePrice: number;
  category: string | null;
  mapped: boolean;
  needsReview: boolean;
  autoCreated: boolean;      // needs_review === true implies auto-created via import
}

export default function ChainMenuPerformancePage() {
  const { startDate, endDate, presetLabel } = useDateRange();
  const { data: dishes } = useDishes();
  const { data: locations } = useLocations();
  const { data: sales } = useSales(startDate, endDate);
  const { data: extItems } = useAllExternalPOSItems();

  // UI filter state
  const [tab, setTab] = useState<BucketTab>('sold');
  const [includeModifiers, setIncludeModifiers] = useState(false);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | PosItemType>('all');
  const [search, setSearch] = useState('');

  // Build a lookup: dish_id -> department (via external_pos_items.mapped_dish_id)
  const dishMeta = useMemo(() => {
    const map = new Map<string, { department: string | null; needsReview: boolean; extName: string | null }>();
    (extItems || []).forEach((e) => {
      if (!e.mapped_dish_id) return;
      // Prefer the first non-empty department we see for a given dish
      const existing = map.get(e.mapped_dish_id);
      if (!existing || (!existing.department && e.department)) {
        map.set(e.mapped_dish_id, {
          department: e.department,
          needsReview: !!e.needs_review,
          extName: e.external_item_name,
        });
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
      const meta = dishMeta.get(dish.id);
      const dept = meta?.department ?? null;
      return {
        id: dish.id,
        name: dish.name,
        department: dept,
        itemType: inferItemType(dept, dish.name),
        quantity: qty,
        revenue: rev,
        basePrice: dish.selling_price,
        category: dish.category,
        mapped: true, // dish exists → treated as mapped
        needsReview: meta?.needsReview ?? false,
        autoCreated: meta?.needsReview ?? false,
      };
    });
  }, [dishes, sales, dishMeta]);

  // Bucket counts (before applying tab/type/status filters)
  const buckets = useMemo(() => {
    const modifiers = rows.filter((r) => r.itemType === 'modifier');
    const nonMod = rows.filter((r) => r.itemType !== 'modifier');
    const sold = nonMod.filter((r) => r.quantity > 0);
    const zero = nonMod.filter((r) => r.quantity === 0);
    const review = rows.filter((r) => r.needsReview);
    return {
      sold: sold.length,
      zero: zero.length,
      review: review.length,
      modifiers: modifiers.length,
      all: rows.length,
    };
  }, [rows]);

  // Sensible underperformer logic: only sold food/drink items that are active
  // (had at least one sale in the period) AND fall in the bottom quartile of qty
  // among their peers, using a minimum sales threshold.
  const underperformers = useMemo(() => {
    const peers = rows.filter((r) => (r.itemType === 'food' || r.itemType === 'drink') && r.quantity > 0);
    if (peers.length < 4) return [] as Row[];
    const qtys = peers.map((r) => r.quantity).sort((a, b) => a - b);
    const q1 = qtys[Math.floor(qtys.length * 0.25)];
    const threshold = Math.max(3, q1); // never flag things selling >=3 units unless truly low
    return peers.filter((r) => r.quantity < threshold);
  }, [rows]);

  // Apply UI filters
  const filtered = useMemo(() => {
    let list = rows;

    // Tab bucket
    if (tab === 'sold') list = list.filter((r) => r.quantity > 0 && r.itemType !== 'modifier');
    else if (tab === 'zero') list = list.filter((r) => r.quantity === 0 && r.itemType !== 'modifier');
    else if (tab === 'review') list = list.filter((r) => r.needsReview);
    else if (tab === 'modifiers') list = list.filter((r) => r.itemType === 'modifier');
    // 'all' → no bucket filter

    if (!includeModifiers && tab !== 'modifiers' && tab !== 'all') {
      list = list.filter((r) => r.itemType !== 'modifier');
    }

    if (typeFilter !== 'all') list = list.filter((r) => r.itemType === typeFilter);

    if (status === 'mapped') list = list.filter((r) => r.mapped && !r.needsReview);
    else if (status === 'unmapped') list = list.filter((r) => !r.mapped);
    else if (status === 'auto-review') list = list.filter((r) => r.needsReview);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.department || '').toLowerCase().includes(q),
      );
    }

    return [...list].sort((a, b) => b.revenue - a.revenue);
  }, [rows, tab, includeModifiers, typeFilter, status, search]);

  // Chart data: top sold food/drink (modifiers only if toggled)
  const chartData = useMemo(() => {
    const pool = rows.filter((r) => {
      if (r.quantity <= 0) return false;
      if (r.itemType === 'modifier') return includeModifiers;
      return r.itemType === 'food' || r.itemType === 'drink';
    });
    return pool
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
      .map((r) => ({ name: r.name.substring(0, 18), revenue: r.revenue, quantity: r.quantity }));
  }, [rows, includeModifiers]);

  const topPerformer = chartData[0]?.name || '-';

  const recommendations = useMemo(() => {
    const recs: string[] = [];
    if (buckets.review > 0) {
      recs.push(`${buckets.review} auto-created item(s) need review — assign a proper type or merge with an existing dish.`);
    }
    if (underperformers.length > 0) {
      recs.push(`${underperformers.length} sold item(s) fall below the peer sales threshold for the selected period.`);
    }
    if (buckets.zero > 0) {
      recs.push(`${buckets.zero} item(s) had zero sales in this period. Check if they are still on an active menu.`);
    }
    return recs;
  }, [buckets, underperformers]);

  return (
    <PageLayout title="Chain Menu Performance" description="Compare dish performance across all locations">
      <div className="space-y-6">
        <div className="text-sm text-muted-foreground">
          Showing data for: <span className="font-medium text-foreground">{presetLabel}</span>
          {startDate !== endDate && <span> ({startDate} → {endDate})</span>}
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Total Items</p>
              <p className="text-2xl font-bold">{buckets.all}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Sold</p>
              <p className="text-2xl font-bold text-green-600">{buckets.sold}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Zero-sale</p>
              <p className="text-2xl font-bold text-muted-foreground">{buckets.zero}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Needs Review</p>
              <p className="text-2xl font-bold text-yellow-500">{buckets.review}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Underperformers</p>
              <p className="text-2xl font-bold text-destructive">{underperformers.length}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Sold food/drink only</p>
            </CardContent>
          </Card>
        </div>

        {recommendations.length > 0 && (
          <Card className="border-primary/50 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-primary" /> Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Top items chart */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Top Items by Revenue</CardTitle>
              <CardDescription>
                Defaults to sold food & drink. Top performer: <span className="font-medium text-foreground">{topPerformer}</span>
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="chart-mods" checked={includeModifiers} onCheckedChange={setIncludeModifiers} />
              <Label htmlFor="chart-mods" className="text-sm">Include modifiers / sides</Label>
            </div>
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
                      color: 'hsl(var(--foreground))',
                    }}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" name={`Revenue (${currencySymbol})`} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="quantity" fill="hsl(var(--chart-2))" name="Quantity" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Table with filters */}
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
              <Input
                placeholder="Search name or department…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Item type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="food">Food</SelectItem>
                  <SelectItem value="drink">Drink</SelectItem>
                  <SelectItem value="modifier">Modifier / Side</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Mapping status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="mapped">Mapped</SelectItem>
                  <SelectItem value="auto-review">Auto-created (review)</SelectItem>
                  <SelectItem value="unmapped">Unmapped</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 ml-auto">
                <Switch
                  id="tbl-mods"
                  checked={includeModifiers}
                  onCheckedChange={setIncludeModifiers}
                />
                <Label htmlFor="tbl-mods" className="text-sm">Include modifiers</Label>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2">Product</th>
                    <th className="text-left py-3 px-2">Department</th>
                    <th className="text-left py-3 px-2">Type</th>
                    <th className="text-right py-3 px-2">Qty</th>
                    <th className="text-right py-3 px-2">Revenue</th>
                    <th className="text-right py-3 px-2">Price</th>
                    <th className="text-center py-3 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map((r) => {
                    const isUnder = underperformers.some((u) => u.id === r.id);
                    return (
                      <tr key={r.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-2">
                          <p className="font-medium">{r.name}</p>
                          {r.category && (
                            <p className="text-xs text-muted-foreground">{r.category}</p>
                          )}
                        </td>
                        <td className="py-3 px-2 text-muted-foreground">
                          {r.department || <span className="italic">—</span>}
                        </td>
                        <td className="py-3 px-2">
                          <Badge variant="outline" className="capitalize">
                            {ITEM_TYPE_LABEL[r.itemType]}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-right">{r.quantity}</td>
                        <td className="py-3 px-2 text-right font-medium">
                          {formatCurrency(r.revenue)}
                        </td>
                        <td className="py-3 px-2 text-right">{formatCurrency(r.basePrice)}</td>
                        <td className="py-3 px-2 text-center">
                          <div className="flex flex-col items-center gap-1">
                            {r.needsReview ? (
                              <Badge className="bg-yellow-500/20 text-yellow-600">Needs review</Badge>
                            ) : (
                              <Badge variant="secondary">Mapped</Badge>
                            )}
                            {r.quantity === 0 ? (
                              <Badge variant="outline" className="text-muted-foreground">
                                No sales
                              </Badge>
                            ) : isUnder ? (
                              <Badge variant="destructive">
                                <TrendingDown className="h-3 w-3 mr-1" />Underperforming
                              </Badge>
                            ) : (
                              <Badge className="bg-green-500/20 text-green-600">
                                <TrendingUp className="h-3 w-3 mr-1" />Selling
                              </Badge>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-muted-foreground">
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
