import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useDishes, type Dish } from "@/hooks/useDishes";
import { useLocations } from "@/hooks/useLocations";
import { useMenus } from "@/hooks/useMenus";
import { useSales } from "@/hooks/useSales";
import { useLocation } from "@/contexts/LocationContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { DishDetailDialog } from "@/components/dishes/DishDetailDialog";
import { DishActionsMenu } from "@/components/dishes/DishActionsMenu";
import { supabase } from "@/integrations/supabase/client";
import {
  TrendingUp, TrendingDown, AlertTriangle, Sparkles, Loader2, Percent,
  AlertCircle, CheckCircle2, Search, ArrowUpDown, Copy,
} from "lucide-react";
import { formatCurrency, currencySymbol } from "@/lib/currency";
import { cn } from "@/lib/utils";

const TARGET_MIN = 28;
const TARGET_MAX = 32;
const MIN_AI_DISHES = 5;
const MIN_AI_COVERAGE = 30;

type CostStatus = "costed" | "direct" | "missing" | "needs_review";

interface DishRow {
  id: string;
  dish: Dish;
  name: string;
  category: string;
  locationId: string | null;
  sellingPrice: number;
  cost: number | null;
  foodCostPercent: number | null;
  marginPercent: number | null;
  grossProfit: number | null;
  salesQty: number | null;
  gpContribution: number | null;
  status: CostStatus;
  /** true when another canonical dish with the same name/location carries the cost */
  isDuplicate: boolean;
  duplicateOf: string | null;
  /** rows excluded from metrics: missing cost OR duplicate shadow row */
  countsTowardMetrics: boolean;
}

type SortKey = "name" | "sellingPrice" | "cost" | "foodCostPercent" | "marginPercent" | "grossProfit" | "salesQty" | "status";

function normalizeName(n: string) {
  return n.trim().toLowerCase().replace(/\s+/g, " ");
}

function statusBadge(status: CostStatus) {
  switch (status) {
    case "costed":
      return <Badge variant="secondary" className="bg-success/15 text-success">Costed</Badge>;
    case "direct":
      return <Badge variant="secondary" className="bg-primary/15 text-primary">Direct cost</Badge>;
    case "missing":
      return <Badge variant="secondary" className="bg-warning/15 text-warning">Missing cost</Badge>;
    case "needs_review":
      return <Badge variant="secondary" className="bg-warning/15 text-warning">Needs review</Badge>;
  }
}

export default function CostAnalysisPage() {
  const { selectedLocationId } = useLocation();
  const { startDate, endDate } = useDateRange();
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;

  const [locationFilter, setLocationFilter] = useState<string>("_global");
  const effectiveLocationId = locationFilter === "_global" ? selectedLocationId : locationFilter === "_all" ? null : locationFilter;

  const { data: allDishes = [], isLoading, error: dishesError } = useDishes(effectiveLocationId, {
    includeArchived: true,
  });
  // Archived dishes are hidden from every active view, metric and ranking, but
  // remain reachable through the Archived filter for restore / maintenance.
  const activeDishes = useMemo(() => allDishes.filter((d) => !d.archived_at), [allDishes]);
  const archivedDishes = useMemo(() => allDishes.filter((d) => !!d.archived_at), [allDishes]);
  const dishes = activeDishes;
  const { data: locations = [] } = useLocations();
  const { data: menus = [] } = useMenus(effectiveLocationId, "active");
  const { data: sales = [] } = useSales(startDate, endDate, effectiveLocationId);

  const [menuFilter, setMenuFilter] = useState<string>("_all");
  const [categoryFilter, setCategoryFilter] = useState<string>("_all");
  const [statusFilter, setStatusFilter] = useState<string>("_all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [aiResult, setAiResult] = useState<any | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Menu membership (canonical junction — read only)
  const { data: menuDishes = [] } = useQuery({
    queryKey: ["menu-dish-map", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_dishes")
        .select("menu_id, dish_id")
        .eq("restaurant_id", restaurantId!);
      if (error) throw error;
      return data as { menu_id: string; dish_id: string }[];
    },
    enabled: !!restaurantId,
  });

  const dishMenuMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    menuDishes.forEach((md) => {
      if (!m.has(md.dish_id)) m.set(md.dish_id, new Set());
      m.get(md.dish_id)!.add(md.menu_id);
    });
    return m;
  }, [menuDishes]);

  const salesByDish = useMemo(() => {
    const m = new Map<string, number>();
    sales.forEach((s) => m.set(s.dish_id, (m.get(s.dish_id) || 0) + Number(s.quantity || 0)));
    return m;
  }, [sales]);

  // Build rows + duplicate detection (same normalized name within the same location)
  const rows: DishRow[] = useMemo(() => {
    const groups = new Map<string, Dish[]>();
    dishes.forEach((d) => {
      const key = `${normalizeName(d.name)}::${d.location_id ?? "all"}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    });

    // Preferred canonical member per group: the one with a cost, else the one with a POS link, else first
    const canonicalId = new Map<string, string>();
    groups.forEach((members, key) => {
      const withCost = members.find((m) => m.dish_cost !== null && m.dish_cost !== undefined);
      const chosen = withCost ?? members[0];
      canonicalId.set(key, chosen.id);
    });

    return dishes.map((d) => {
      const key = `${normalizeName(d.name)}::${d.location_id ?? "all"}`;
      const members = groups.get(key)!;
      const canonical = canonicalId.get(key)!;
      const isDuplicate = members.length > 1 && d.id !== canonical;

      const sellingPrice = Number(d.selling_price) || 0;
      const rawCost = d.dish_cost;
      const hasCost = rawCost !== null && rawCost !== undefined;
      const cost = hasCost ? Number(rawCost) : null;
      const foodCostPercent = cost !== null && sellingPrice > 0 ? (cost / sellingPrice) * 100 : null;
      const marginPercent = cost !== null && sellingPrice > 0 ? ((sellingPrice - cost) / sellingPrice) * 100 : null;
      const grossProfit = cost !== null ? sellingPrice - cost : null;
      const qty = salesByDish.has(d.id) ? salesByDish.get(d.id)! : null;

      let status: CostStatus = "missing";
      if (d.needs_review) status = "needs_review";
      else if (cost !== null && d.use_direct_cost) status = "direct";
      else if (cost !== null) status = "costed";

      return {
        id: d.id,
        dish: d,
        name: d.name,
        category: d.category || d.department || "Uncategorized",
        locationId: d.location_id,
        sellingPrice,
        cost,
        foodCostPercent,
        marginPercent,
        grossProfit,
        salesQty: qty,
        gpContribution: grossProfit !== null && qty !== null ? grossProfit * qty : null,
        status,
        isDuplicate,
        duplicateOf: isDuplicate ? canonical : null,
        countsTowardMetrics: !isDuplicate,
      };
    });
  }, [dishes, salesByDish]);

  // Separate rows for the Archived view (never part of metrics)
  const archivedRows = useMemo(
    () =>
      archivedDishes.map((d) => ({
        id: d.id,
        dish: d,
        name: d.name,
        category: d.category || d.department || "Uncategorized",
      })),
    [archivedDishes]
  );

  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category))).sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  // Metric universe: canonical rows only (duplicate shadows never double-count)
  const canonicalRows = useMemo(() => rows.filter((r) => r.countsTowardMetrics), [rows]);
  const costedRows = useMemo(() => canonicalRows.filter((r) => r.cost !== null), [canonicalRows]);
  const missingRows = useMemo(() => canonicalRows.filter((r) => r.cost === null), [canonicalRows]);
  const duplicateRows = useMemo(() => rows.filter((r) => r.isDuplicate), [rows]);

  const coverage = canonicalRows.length > 0 ? (costedRows.length / canonicalRows.length) * 100 : 0;
  const avgFoodCost = costedRows.length > 0
    ? costedRows.reduce((s, r) => s + (r.foodCostPercent ?? 0), 0) / costedRows.length : null;
  const avgMargin = costedRows.length > 0
    ? costedRows.reduce((s, r) => s + (r.marginPercent ?? 0), 0) / costedRows.length : null;
  const avgGrossProfit = costedRows.length > 0
    ? costedRows.reduce((s, r) => s + (r.grossProfit ?? 0), 0) / costedRows.length : null;
  const outsideTarget = costedRows.filter(
    (r) => r.foodCostPercent !== null && (r.foodCostPercent < TARGET_MIN || r.foodCostPercent > TARGET_MAX)
  );

  const hasSalesData = costedRows.some((r) => (r.salesQty ?? 0) > 0);
  const bestMargin = [...costedRows].sort((a, b) => (b.marginPercent ?? 0) - (a.marginPercent ?? 0)).slice(0, 5);
  const worstMargin = [...costedRows].sort((a, b) => (a.marginPercent ?? 0) - (b.marginPercent ?? 0)).slice(0, 5);
  const highestFoodCost = [...costedRows].sort((a, b) => (b.foodCostPercent ?? 0) - (a.foodCostPercent ?? 0)).slice(0, 5);
  const lowestFoodCost = [...costedRows].sort((a, b) => (a.foodCostPercent ?? 0) - (b.foodCostPercent ?? 0)).slice(0, 5);
  const topContribution = hasSalesData
    ? [...costedRows].filter((r) => r.gpContribution !== null).sort((a, b) => (b.gpContribution ?? 0) - (a.gpContribution ?? 0)).slice(0, 5)
    : [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (menuFilter !== "_all" && !(dishMenuMap.get(r.id)?.has(menuFilter))) return false;
      if (categoryFilter !== "_all" && r.category !== categoryFilter) return false;
      if (statusFilter === "costed" && !(r.status === "costed" || r.status === "direct")) return false;
      if (statusFilter === "missing" && r.cost !== null) return false;
      if (statusFilter === "needs_review" && r.status !== "needs_review") return false;
      if (statusFilter === "duplicates" && !r.isDuplicate) return false;
      if (statusFilter === "archived") return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.category.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, menuFilter, categoryFilter, statusFilter, search, dishMenuMap]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: DishRow): number | string | null => {
      switch (sortKey) {
        case "name": return r.name.toLowerCase();
        case "status": return r.status;
        case "sellingPrice": return r.sellingPrice;
        case "cost": return r.cost;
        case "foodCostPercent": return r.foodCostPercent;
        case "marginPercent": return r.marginPercent;
        case "grossProfit": return r.grossProfit;
        case "salesQty": return r.salesQty;
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a); const vb = val(b);
      // nulls (incomplete data) always sort last, never as zero
      if (va === null && vb === null) return a.name.localeCompare(b.name);
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb)) * dir;
      return (va - vb) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" || key === "status" ? "asc" : "desc"); }
  };

  const openDish = (dish: Dish) => { setSelectedDish(dish); setDetailOpen(true); };

  const aiReady = costedRows.length >= MIN_AI_DISHES && coverage >= MIN_AI_COVERAGE;

  const generateAIInsight = async () => {
    setLoadingInsight(true); setAiError(null);
    try {
      const payload = costedRows.map((r) => ({
        name: r.name,
        category: r.category,
        cost: r.cost,
        sellingPrice: r.sellingPrice,
        foodCostPercent: r.foodCostPercent,
        marginPercent: r.marginPercent,
        grossProfit: r.grossProfit,
        salesQty: r.salesQty,
      }));
      const response = await supabase.functions.invoke("ai-cost-analysis", {
        body: {
          dishes: payload,
          restaurant_id: restaurantId,
          coverage: { costed: costedRows.length, missing: missingRows.length, coveragePercent: Number(coverage.toFixed(1)) },
        },
      });
      if (response.error) throw new Error(response.error.message || "Failed to get AI analysis");
      if (response.data?.error) throw new Error(response.data.error);
      setAiResult(response.data);
    } catch (error: any) {
      setAiError(error.message || "Failed to generate AI insight");
    } finally {
      setLoadingInsight(false);
    }
  };

  const SortHeader = ({ label, k, align = "right" }: { label: string; k: SortKey; align?: "left" | "right" }) => (
    <th className={cn("py-2 font-medium", align === "right" ? "text-right" : "text-left")}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground transition-colors", sortKey === k && "text-foreground")}
      >
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );

  const RankList = ({ title, items, render }: { title: string; items: DishRow[]; render: (r: DishRow) => string }) => (
    <div>
      <h4 className="text-xs uppercase text-muted-foreground font-medium mb-2">{title}</h4>
      <div className="space-y-1">
        {items.map((r) => (
          <button
            key={r.id}
            onClick={() => openDish(r.dish)}
            className="w-full flex items-center justify-between gap-2 text-sm py-1 px-2 rounded hover:bg-muted/60 text-left"
          >
            <span className="truncate">{r.name}</span>
            <span className="font-medium shrink-0">{render(r)}</span>
          </button>
        ))}
        {items.length === 0 && <p className="text-xs text-muted-foreground px-2">Not enough cost data.</p>}
      </div>
    </div>
  );

  return (
    <PageLayout title="Cost Analysis" description="Decide where to fix costs — driven by the canonical dish recipes">
      <div className="space-y-6">
        {dishesError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error loading data</AlertTitle>
            <AlertDescription>{(dishesError as Error).message}</AlertDescription>
          </Alert>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading cost data...</span>
          </div>
        )}

        {!isLoading && !dishesError && allDishes.length === 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No dishes found</AlertTitle>
            <AlertDescription>Add dishes on Menu / Dishes to see cost analysis.</AlertDescription>
          </Alert>
        )}

        {!isLoading && allDishes.length > 0 && (
          <>
            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search dishes…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 h-10"
                    />
                  </div>
                  <Select value={locationFilter} onValueChange={setLocationFilter}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Location" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_global">Location: global selection</SelectItem>
                      <SelectItem value="_all">All locations</SelectItem>
                      {locations.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={menuFilter} onValueChange={setMenuFilter}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Menu" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All menus</SelectItem>
                      {menus.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All categories</SelectItem>
                      {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Cost status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All cost statuses</SelectItem>
                      <SelectItem value="costed">Costed</SelectItem>
                      <SelectItem value="missing">Missing cost</SelectItem>
                      <SelectItem value="needs_review">Needs review</SelectItem>
                      <SelectItem value="duplicates">Possible duplicates</SelectItem>
                      <SelectItem value="archived">Archived ({archivedDishes.length})</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Coverage banner */}
            {missingRows.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{missingRows.length} dishes are missing cost data</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center gap-2">
                  <span>All averages, rankings and AI analysis exclude these dishes — they are never treated as zero cost.</span>
                  <Button size="sm" variant="outline" onClick={() => setStatusFilter("missing")}>Work through missing costs</Button>
                </AlertDescription>
              </Alert>
            )}

            {duplicateRows.length > 0 && (
              <Alert>
                <Copy className="h-4 w-4" />
                <AlertTitle>{duplicateRows.length} possible duplicate dish records</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center gap-2">
                  <span>
                    These share a name and location with another canonical dish (typically one manual/menu record plus one
                    POS-imported record). They are counted once in every metric and are not treated as separate recipes.
                    Nothing has been merged automatically — use the row actions to merge a duplicate into its master.
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setStatusFilter("duplicates")}>Review duplicates</Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2"><Percent className="h-4 w-4" /> Avg food cost</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{avgFoodCost !== null ? `${avgFoodCost.toFixed(1)}%` : "—"}</div>
                  <p className="text-xs text-muted-foreground">{costedRows.length} costed dishes · target {TARGET_MIN}–{TARGET_MAX}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2"><span className="h-4 w-4 font-medium">{currencySymbol}</span> Avg gross profit</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{avgGrossProfit !== null ? formatCurrency(avgGrossProfit) : "—"}</div>
                  <p className="text-xs text-muted-foreground">per item sold</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2"><TrendingUp className="h-4 w-4 text-success" /> Avg margin</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{avgMargin !== null ? `${avgMargin.toFixed(1)}%` : "—"}</div>
                  <p className="text-xs text-muted-foreground">costed dishes only</p>
                </CardContent>
              </Card>
              <Card className={cn(missingRows.length > 0 && "border-warning")}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Cost coverage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{coverage.toFixed(0)}%</div>
                  <p className="text-xs text-muted-foreground">
                    {costedRows.length} costed ·{" "}
                    <button
                      type="button"
                      onClick={() => setStatusFilter("missing")}
                      className="text-warning underline underline-offset-2 hover:text-warning/80"
                    >
                      {missingRows.length} missing
                    </button>
                  </p>
                </CardContent>
              </Card>
              <Card className={cn(outsideTarget.length > 0 && "border-destructive/50")}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Outside target</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{costedRows.length > 0 ? outsideTarget.length : "—"}</div>
                  <p className="text-xs text-muted-foreground">dishes outside {TARGET_MIN}–{TARGET_MAX}% food cost</p>
                </CardContent>
              </Card>
            </div>

            {/* Actionable analysis */}
            <Card>
              <CardHeader>
                <CardTitle>Where to act</CardTitle>
                <CardDescription>
                  Costed dishes only — dishes with missing recipes or costs are excluded from every ranking.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {costedRows.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No costed dishes yet. Add recipe ingredients or a direct cost to unlock this analysis.
                  </div>
                ) : (
                  <div className={cn("grid gap-6", topContribution.length > 0 ? "md:grid-cols-3 lg:grid-cols-5" : "md:grid-cols-2 lg:grid-cols-4")}>
                    <RankList title="Best margin" items={bestMargin} render={(r) => `${(r.marginPercent ?? 0).toFixed(1)}%`} />
                    <RankList title="Worst margin" items={worstMargin} render={(r) => `${(r.marginPercent ?? 0).toFixed(1)}%`} />
                    <RankList title="Highest food cost %" items={highestFoodCost} render={(r) => `${(r.foodCostPercent ?? 0).toFixed(1)}%`} />
                    <RankList title="Lowest food cost %" items={lowestFoodCost} render={(r) => `${(r.foodCostPercent ?? 0).toFixed(1)}%`} />
                    {topContribution.length > 0 && (
                      <RankList title="Top gross profit contribution" items={topContribution} render={(r) => formatCurrency(r.gpContribution ?? 0)} />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> AI Cost Optimization</CardTitle>
                  <CardDescription>Analyses only dishes with real recipe or direct cost data</CardDescription>
                </div>
                <Button onClick={generateAIInsight} disabled={loadingInsight || !aiReady}>
                  {loadingInsight ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Analyze Costs
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {!aiReady && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Not enough cost data for a reliable analysis</AlertTitle>
                    <AlertDescription>
                      Complete these first: {costedRows.length < MIN_AI_DISHES && (
                        <>at least {MIN_AI_DISHES} dishes with a recipe or direct cost (currently {costedRows.length}); </>
                      )}
                      {coverage < MIN_AI_COVERAGE && (
                        <>cost coverage of at least {MIN_AI_COVERAGE}% (currently {coverage.toFixed(0)}%, {missingRows.length} dishes missing cost)</>
                      )}
                      . Open any dish below to add ingredients or a direct cost.
                    </AlertDescription>
                  </Alert>
                )}
                {aiError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{aiError}</AlertDescription>
                  </Alert>
                )}
                {aiResult && (
                  <div className="space-y-4 text-sm">
                    {aiResult.insights && <p className="whitespace-pre-wrap">{aiResult.insights}</p>}
                    {Array.isArray(aiResult.recommendations) && aiResult.recommendations.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-1">Recommendations</h4>
                        <ul className="list-disc pl-5 space-y-1">{aiResult.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                      </div>
                    )}
                    {Array.isArray(aiResult.quickWins) && aiResult.quickWins.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-1">Quick wins</h4>
                        <ul className="list-disc pl-5 space-y-1">{aiResult.quickWins.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                      </div>
                    )}
                    {Array.isArray(aiResult.longTermStrategies) && aiResult.longTermStrategies.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-1">Longer term</h4>
                        <ul className="list-disc pl-5 space-y-1">{aiResult.longTermStrategies.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                      </div>
                    )}
                    {missingRows.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Based on {costedRows.length} costed dishes. {missingRows.length} dishes were excluded because their cost data is incomplete.
                      </p>
                    )}
                  </div>
                )}
                {!aiResult && !aiError && aiReady && (
                  <p className="text-muted-foreground text-sm">Click "Analyze Costs" to get recommendations for your costed dishes.</p>
                )}
              </CardContent>
            </Card>

            {/* Dish table */}
            <Card>
              <CardHeader>
                <CardTitle>Dishes ({sorted.length})</CardTitle>
                <CardDescription>
                  Click a dish name to open its recipe and cost detail. Sort any financial column to find outliers.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs uppercase">
                        <SortHeader label="Dish" k="name" align="left" />
                        <SortHeader label="Selling price" k="sellingPrice" />
                        <SortHeader label="Recipe cost" k="cost" />
                        <SortHeader label="Food cost %" k="foodCostPercent" />
                        <SortHeader label={`Gross profit ${currencySymbol}`} k="grossProfit" />
                        <SortHeader label="Margin %" k="marginPercent" />
                        <SortHeader label="Sales qty" k="salesQty" />
                        <SortHeader label="Status" k="status" />
                        <th className="py-2 font-medium text-right w-10"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r) => (
                        <tr key={r.id} className="border-b hover:bg-muted/40">
                          <td className="py-2">
                            <button
                              type="button"
                              onClick={() => openDish(r.dish)}
                              className="font-medium text-left hover:underline underline-offset-2"
                            >
                              {r.name}
                            </button>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <span>{r.category}</span>
                              {r.isDuplicate && (
                                <Badge variant="outline" className="text-[10px] py-0">Duplicate record</Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-2 text-right">{formatCurrency(r.sellingPrice)}</td>
                          <td className="py-2 text-right">
                            {r.cost !== null ? formatCurrency(r.cost) : <span className="text-warning">Missing</span>}
                          </td>
                          <td className="py-2 text-right">
                            {r.foodCostPercent !== null ? (
                              <span className={cn(r.foodCostPercent > TARGET_MAX && "text-destructive font-medium", r.foodCostPercent < TARGET_MIN && "text-success")}>
                                {r.foodCostPercent.toFixed(1)}%
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2 text-right">
                            {r.grossProfit !== null ? formatCurrency(r.grossProfit) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2 text-right">
                            {r.marginPercent !== null ? (
                              <span className={cn(r.marginPercent < 50 ? "text-warning" : "text-success")}>{r.marginPercent.toFixed(1)}%</span>
                            ) : <span className="text-warning">Incomplete</span>}
                          </td>
                          <td className="py-2 text-right">
                            {r.salesQty !== null ? r.salesQty : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2 text-right">{statusBadge(r.status)}</td>
                          <td className="py-2 text-right">
                            <DishActionsMenu dish={r.dish} onEdit={openDish} allDishes={allDishes} />
                          </td>
                        </tr>
                      ))}
                      {sorted.length === 0 && (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-muted-foreground">
                            No dishes match the current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {!hasSalesData && (
                  <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                    <TrendingDown className="h-3 w-3" /> No sales recorded in the selected date range — sales quantity and profit contribution are unavailable.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Archived dishes — hidden from every active view and metric */}
            {statusFilter === "archived" && (
              <Card>
                <CardHeader>
                  <CardTitle>Archived dishes ({archivedRows.length})</CardTitle>
                  <CardDescription>
                    Recipes, POS mappings and historical sales links are preserved. Restore a dish to bring it back into
                    Cost Analysis and Dishes.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground text-xs uppercase">
                          <th className="py-2 font-medium text-left">Dish</th>
                          <th className="py-2 font-medium text-right">Selling price</th>
                          <th className="py-2 font-medium text-right">Status</th>
                          <th className="py-2 font-medium text-right w-10"><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {archivedRows.map((r) => (
                          <tr key={r.id} className="border-b hover:bg-muted/40">
                            <td className="py-2">
                              <button
                                type="button"
                                onClick={() => openDish(r.dish)}
                                className="font-medium text-left hover:underline underline-offset-2"
                              >
                                {r.name}
                              </button>
                              <div className="text-xs text-muted-foreground">{r.category}</div>
                            </td>
                            <td className="py-2 text-right">{formatCurrency(Number(r.dish.selling_price))}</td>
                            <td className="py-2 text-right">
                              <Badge variant="outline">
                                {r.dish.merged_into_id ? "Merged" : "Archived"}
                              </Badge>
                            </td>
                            <td className="py-2 text-right">
                              <DishActionsMenu dish={r.dish} onEdit={openDish} allDishes={allDishes} />
                            </td>
                          </tr>
                        ))}
                        {archivedRows.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-muted-foreground">
                              No archived dishes.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <DishDetailDialog dish={selectedDish} open={detailOpen} onOpenChange={setDetailOpen} />
    </PageLayout>
  );
}
