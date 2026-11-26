import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useProductsSold } from "@/hooks/useProductsSold";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocation } from "@/contexts/LocationContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { PRODUCT_CLASS_LABEL } from "@/lib/productClassification";
import { formatOrdinalDate, formatOrdinalRange } from "@/lib/ordinalDate";
import { formatCurrency } from "@/lib/currency";
import { clampTradingDay, defaultTradingDay, rankProducts, shiftTradingDay, type RankingKind, type SoldProduct } from "@/lib/productsSold";
import { format } from "date-fns";

const ORDER_SOURCES = ["Just Eat", "Own website", "In-store", "Other", "Unknown"];
const FULFILMENT = ["Dine-in", "Collection", "Delivery"];

function Qty({ p }: { p: SoldProduct }) {
  return <>{p.quantity ?? "Unknown"}{p.quantity != null && " units"}{p.source !== "Posted" && p.quantity != null && <span className="block text-xs text-muted-foreground">provisional</span>}</>;
}

/** Reports-only: one trading day item breakdown plus period/day rankings. */
export function ProductsSoldPanel({ start, end }: { start: string; end: string }) {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const scopeKey = `${currentRestaurant?.id}|${selectedLocationId ?? "all"}|${start}|${end}`;
  const range = useProductsSold(start, end);
  const [day, setDay] = useState<string | null>(null);
  const [dayScope, setDayScope] = useState(scopeKey);
  // Reset to the default day when restaurant, location or range changes.
  useEffect(() => { if (dayScope !== scopeKey) { setDayScope(scopeKey); setDay(null); } }, [scopeKey, dayScope]);
  const fallbackDay = range.data ? defaultTradingDay(range.data.receivedDates, start, end, format(new Date(), "yyyy-MM-dd")) : null;
  const activeDay = day ? clampTradingDay(day, start, end) : fallbackDay;
  const dayQuery = useProductsSold(activeDay ?? start, activeDay ?? start);

  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("dishes");
  const [source, setSource] = useState("all");
  const [limit, setLimit] = useState(50);
  const [basis, setBasis] = useState<"period" | "day">("period");
  const [kind, setKind] = useState<RankingKind>("both");

  const dayData = activeDay ? dayQuery.data : undefined;
  const rows = useMemo(() => (dayData?.products ?? []).filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) && (source === "all" || p.source === source) &&
    (mode === "all" || (mode === "dishes" ? p.category === "dish_drink" : mode === "notes" ? p.category === "kitchen_note" : p.category === "adjustment")))
    .sort((a, b) => (b.quantity ?? -Infinity) - (a.quantity ?? -Infinity) || a.name.localeCompare(b.name)), [dayData, search, mode, source]);
  const sources = useMemo(() => new Set((dayData?.products ?? []).map(p => p.source)), [dayData]);

  const rankData = basis === "period" ? range.data : dayData;
  const rankQuery = basis === "period" ? range : dayQuery;
  const rankLabel = basis === "period" ? `Reporting period: ${formatOrdinalRange(start, end)}` : activeDay ? `Trading day: ${formatOrdinalDate(activeDay, true)}` : "Trading day";
  const top = rankData ? rankProducts(rankData.products, kind, "top") : [];
  const bottom = rankData ? rankProducts(rankData.products, kind, "bottom") : [];
  const locName = (id: string, data = dayData ?? range.data) => data?.locations.find(l => l.id === id)?.name;
  const multiLoc = (range.data?.locations.length ?? 0) > 1;

  return <section aria-label="Dish and drink breakdown" className="min-w-0 space-y-6 border-y border-border py-4">
    {/* ---------- Single trading day item breakdown ---------- */}
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Dish & drink breakdown — single trading day</h2>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Previous trading day" disabled={!activeDay || activeDay <= start}
          onClick={() => activeDay && setDay(shiftTradingDay(activeDay, -1))}><ChevronLeft className="h-4 w-4" /></Button>
        <Input type="date" aria-label="Trading day" className="h-11 w-44" min={start} max={end} value={activeDay ?? ""}
          onChange={e => e.target.value && setDay(clampTradingDay(e.target.value, start, end))} />
        <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Next trading day" disabled={!activeDay || activeDay >= end}
          onClick={() => activeDay && setDay(shiftTradingDay(activeDay, 1))}><ChevronRight className="h-4 w-4" /></Button>
        {activeDay && <span className="text-sm font-medium">{formatOrdinalDate(activeDay, true)}</span>}
        {day && <Button variant="ghost" className="h-11" onClick={() => setDay(null)}>Latest received day</Button>}
      </div>
      <p className="text-xs text-muted-foreground">Day must fall within the selected reporting period ({formatOrdinalRange(start, end)}). Quantities are units sold (item count). Gross is the actual POS line amount where supplied; otherwise “Unavailable” — never estimated.</p>

      {range.isError || dayQuery.isError ? <p role="alert" className="text-sm text-destructive">Product detail unavailable: {(range.error ?? dayQuery.error)?.message}. Received totals above are separate.</p>
        : !activeDay || dayQuery.isLoading || range.isLoading ? <p>Loading product detail…</p> : dayData && <>
          {dayData.locations.map(loc => {
            const snap = dayData.snapshots.find(s => s.location_id === loc.id);
            const detail = dayData.products.some(p => p.locationId === loc.id);
            const dashboardOnly = snap && snap.journal_coverage !== "complete";
            return <div key={loc.id} className="space-y-1 text-sm">
              <div><strong>{loc.name}</strong> · {snap ? dashboardOnly ? "Dashboard-only day: daily totals received, no order-level journal" : "Complete journal received; item quantities provisional unless posted" : "No Captiva data received for this day"}{!detail && " · Item detail unavailable (not zero sales)"}</div>
              {loc.name.toLowerCase().includes("gourmet pizza") && <div className="overflow-x-auto"><table className="text-xs">
                <thead><tr>{["Breakdown", "Orders", "Gross"].map(h => <th key={h} className="pr-4 text-left font-medium">{h}</th>)}</tr></thead><tbody>
                  <tr><td className="pr-4">All orders (Captiva)</td><td className="pr-4 tabular-nums">{snap?.official_orders ?? "Unknown"}</td><td className="pr-4 tabular-nums">{snap?.official_gross != null ? formatCurrency(Number(snap.official_gross)) : "Unknown"}</td></tr>
                  <tr className="text-muted-foreground"><td className="pr-4 align-top">Order source<br />({ORDER_SOURCES.join(" / ")})</td><td colSpan={2} className="align-top">Not available — received Captiva data carries no order-source field{dashboardOnly && "; dashboard-only days carry no orders at all"}</td></tr>
                  <tr className="text-muted-foreground"><td className="pr-4 align-top">Fulfilment<br />({FULFILMENT.join(" / ")}; takeaway = collection + delivery)</td><td colSpan={2} className="align-top">Not available — no fulfilment field received upstream</td></tr>
                </tbody></table>
                <p className="text-xs text-muted-foreground">Just Eat and website orders are included in the Captiva total only if they were rung through the till; their own platform reports are not imported, so nothing is added on top (no double counting).</p></div>}
            </div>;
          })}
          {dayData.suppressedDays > 0 && <p className="text-xs text-muted-foreground">Journal observations hidden for restaurants with posted POS detail on this day to avoid duplication.</p>}
          <p className="text-sm">{dayData.revenue.postedGross != null
            ? <>Posted item gross {formatCurrency(dayData.revenue.postedGross)}{dayData.revenue.postedDiscounts != null && <> · discounts {formatCurrency(dayData.revenue.postedDiscounts)}</>}{dayData.revenue.difference != null && <> · difference vs received daily gross {formatCurrency(dayData.revenue.difference)} (extras, discounts, refunds or unmatched lines)</>}</>
            : "Item gross: unavailable for this day. Journal quantities carry no verified price, so no amounts are estimated."}</p>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-0 flex-1 basis-52"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input aria-label="Search products" placeholder="Search products" value={search} onChange={e => { setSearch(e.target.value); setLimit(50); }} className="h-11 pl-9" /></div>
            <Select value={mode} onValueChange={v => { setMode(v); setLimit(50); }}><SelectTrigger aria-label="Product view" className="h-11 w-full sm:w-56"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="dishes">Dishes & drinks</SelectItem><SelectItem value="notes">Kitchen notes & modifiers</SelectItem><SelectItem value="adjustments">Voids & refunds</SelectItem><SelectItem value="all">Everything received</SelectItem>
            </SelectContent></Select>
            {sources.size > 1 && <Select value={source} onValueChange={v => { setSource(v); setLimit(50); }}><SelectTrigger aria-label="Detail source" className="h-11 w-full sm:w-52"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="all">All detail sources</SelectItem><SelectItem value="Posted">Posted</SelectItem><SelectItem value="Provisional journal">Provisional journal</SelectItem>
            </SelectContent></Select>}
          </div>
          {rows.length ? <>
            <div className="max-h-[32rem] overflow-auto rounded-md border border-border">
              <table className="w-full min-w-[640px] text-left text-sm"><thead className="sticky top-0 bg-muted"><tr>
                {["Product", ...(multiLoc ? ["Restaurant"] : []), "Units sold", "Actual gross", "Type", "Source"].map(l => <th className="px-3 py-3 font-medium" key={l}>{l}</th>)}
              </tr></thead><tbody>{rows.slice(0, limit).map(p => <tr key={p.key} className="border-t border-border">
                <td className="px-3 py-2.5">{p.name}</td>{multiLoc && <td className="px-3 py-2.5">{locName(p.locationId)}</td>}
                <td className="px-3 py-2.5 tabular-nums"><Qty p={p} /></td><td className="px-3 py-2.5 tabular-nums">{p.gross != null ? formatCurrency(p.gross) : "Unavailable"}</td>
                <td className="px-3 py-2.5">{PRODUCT_CLASS_LABEL[p.classification]}</td>
                <td className="px-3 py-2.5"><Badge variant="outline">{p.source}</Badge>{p.observationType && <span className="block text-xs text-muted-foreground">{p.observationType}</span>}</td>
              </tr>)}</tbody></table>
            </div>
            <p className="text-xs text-muted-foreground">{Math.min(limit, rows.length)} of {rows.length} products on this day. Each description is listed separately, never grouped by a shared product ID.</p>
            {limit < rows.length && <Button variant="outline" className="h-11" onClick={() => setLimit(v => v + 100)}>Show more products</Button>}
          </> : <p className="text-sm text-muted-foreground">{dayData.products.length ? "No products match these filters." : "No item detail for this day. Missing detail is not zero sales."}</p>}
        </>}
    </div>

    {/* ---------- Rankings ---------- */}
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Top & bottom dishes and drinks</h2>
        <span className="text-sm font-medium">{rankLabel}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <SegmentedControl value={basis} onChange={(v: "period" | "day") => setBasis(v)} ariaLabel="Ranking period" className="w-full max-w-sm"
          options={[{ value: "period", label: "Reporting period" }, { value: "day", label: "Selected day" }]} />
        <SegmentedControl value={kind} onChange={(v: RankingKind) => setKind(v)} ariaLabel="Ranking products" className="w-full max-w-sm"
          options={[{ value: "food", label: "Food" }, { value: "drinks", label: "Drinks" }, { value: "both", label: "Both" }]} />
      </div>
      {rankQuery.isError ? <p role="alert" className="text-sm text-destructive">Rankings unavailable.</p> : rankQuery.isLoading || !rankData ? <p>Loading rankings…</p>
        : !top.length ? <p className="text-sm text-muted-foreground">No rankable dish or drink quantities for this {basis === "period" ? "period" : "day"}. Missing detail is not zero sales.</p>
        : <div className="grid gap-4 md:grid-cols-2">
          {([["Top 10 by units sold", top], ["Bottom 10 by units sold", bottom]] as const).map(([title, list]) => <div key={title} className="min-w-0 rounded-md border border-border">
            <h3 className="border-b border-border px-3 py-2 text-sm font-medium">{title}</h3>
            <ol className="divide-y divide-border text-sm">{list.map((p, i) => <li key={p.key} className="flex justify-between gap-3 px-3 py-2">
              <span className="min-w-0">{i + 1}. {p.name}{multiLoc && <span className="block text-xs text-muted-foreground">{locName(p.locationId, rankData)}</span>}</span>
              <span className="shrink-0 text-right tabular-nums"><Qty p={p} /></span></li>)}</ol>
          </div>)}
        </div>}
      {rankData && <p className="text-xs text-muted-foreground">Rankings count units only; kitchen notes, modifiers, voids and unknown quantities are excluded. Journal-based quantities are provisional observations, not verified sales. Posted detail: {rankData.postedDays} restaurant-days · journal detail: {rankData.observationDays} restaurant-days.</p>}
    </div>
  </section>;
}
