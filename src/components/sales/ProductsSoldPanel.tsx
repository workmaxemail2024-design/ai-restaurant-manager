import { useMemo, useState } from "react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { Search } from "lucide-react";
import { useProductsSold } from "@/hooks/useProductsSold";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PRODUCT_CLASS_LABEL } from "@/lib/productClassification";
import { formatOrdinalRange } from "@/lib/ordinalDate";
import { formatCurrency } from "@/lib/currency";

export function ProductsSoldPanel({ start, end }: { start: string; end: string }) {
  const query = useProductsSold(start, end);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("dishes");
  const [source, setSource] = useState("all");
  const [limit, setLimit] = useState(50);
  const products = query.data?.products;
  const rows = useMemo(() => (products ?? []).filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) && (source === "all" || p.source === source) &&
    (mode === "all" || (mode === "dishes" ? p.category === "dish_drink" : mode === "notes" ? p.category === "kitchen_note" : mode === "adjustments" ? p.category === "adjustment" : p.rankable))).sort((a, b) => mode === "bottom"
      ? (a.quantity ?? Infinity) - (b.quantity ?? Infinity) || a.name.localeCompare(b.name)
      : (b.quantity ?? -Infinity) - (a.quantity ?? -Infinity) || a.name.localeCompare(b.name)), [products, search, mode, source]);
  const data = query.data;
  const expected = (differenceInCalendarDays(parseISO(end), parseISO(start)) + 1) * (data?.locations.length ?? 0);
  return <section aria-label="Products sold" className="min-w-0 space-y-3 border-y border-border py-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold">Products sold</h2>
      <span className="text-sm text-muted-foreground">{formatOrdinalRange(start, end)}</span>
    </div>
    <div className="flex flex-wrap gap-2">
      <div className="relative min-w-0 flex-1 basis-52"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input aria-label="Search all products" placeholder="Search products" value={search} onChange={e => { setSearch(e.target.value); setLimit(50); }} className="h-11 pl-9" /></div>
      <Select value={mode} onValueChange={v => { setMode(v); setLimit(50); }}><SelectTrigger aria-label="Product ranking" className="h-11 w-full sm:w-56"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="dishes">Dishes & drinks</SelectItem><SelectItem value="top">Top dishes & drinks</SelectItem><SelectItem value="bottom">Bottom dishes & drinks</SelectItem><SelectItem value="notes">Kitchen notes & modifiers</SelectItem><SelectItem value="adjustments">Voids & refunds</SelectItem><SelectItem value="all">Everything received</SelectItem>
      </SelectContent></Select>
      <Select value={source} onValueChange={v => { setSource(v); setLimit(50); }}><SelectTrigger aria-label="Product source" className="h-11 w-full sm:w-52"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="all">All sources</SelectItem><SelectItem value="Posted">Posted</SelectItem><SelectItem value="Provisional journal">Provisional journal</SelectItem>
      </SelectContent></Select>
    </div>
    {query.isError ? <p role="alert" className="text-sm text-destructive">Products unavailable: {query.error.message}. Received totals above are separate.</p> : query.isLoading ? <p>Loading product detail…</p> : data && <>
      <p className="text-sm text-muted-foreground">Posted detail: {data.postedDays} restaurant-days. Provisional journal detail: {data.observationDays} restaurant-days. Selected period: {expected} restaurant-days. Journal quantities are observations, not verified sales or turnover; no journal values enter financial totals.</p>
      <p className="text-sm">{data.revenue.postedGross != null
        ? <>Posted item gross {formatCurrency(data.revenue.postedGross)}{data.revenue.postedDiscounts != null && <> · discounts {formatCurrency(data.revenue.postedDiscounts)}</>}{data.revenue.difference != null && <> · difference vs received daily gross {formatCurrency(data.revenue.difference)} (extras, discounts, refunds or unmatched lines, shown separately)</>}</>
        : "Item gross amounts: unavailable for this selection. Journal quantities carry no verified price, so no amounts are estimated."}</p>
      {data.suppressedDays > 0 && <p className="text-sm text-muted-foreground">Journal observations excluded on {data.suppressedDays} days with posted POS detail to avoid duplication.</p>}
      {data.locations.map(loc => {
        const snapshots = data.snapshots.filter(s => s.location_id === loc.id);
        const detail = data.products.some(p => p.locationId === loc.id);
        return <div key={loc.id} className="text-sm"><strong>{loc.name}</strong> · {snapshots.length} received days · {snapshots.some(s => s.journal_coverage !== "complete") ? "Partial / dashboard-only journal" : snapshots.length ? "Complete journal received; sales unverified" : "Journal unavailable in this access scope"}{!detail && " · Product detail unavailable (not zero sales)"}
          {(loc.name.toLowerCase().includes("gourmet pizza")) && (() => {
            const known = snapshots.length > 0 && snapshots.every(s => s.official_gross != null && s.official_orders != null);
            const gross = snapshots.reduce((t, s) => t + Number(s.official_gross ?? 0), 0);
            const orders = snapshots.reduce((t, s) => t + Number(s.official_orders ?? 0), 0);
            return <div className="mt-1 overflow-x-auto"><table className="text-xs"><thead><tr>{["Channel", "Orders", "Gross", "Items"].map(h => <th key={h} className="pr-4 text-left font-medium">{h}</th>)}</tr></thead><tbody>
              <tr><td className="pr-4">All</td><td className="pr-4 tabular-nums">{known ? orders : "Unknown"}</td><td className="pr-4 tabular-nums">{known ? formatCurrency(gross) : "Unknown"}</td><td>{detail ? "Table below" : "Unavailable"}</td></tr>
              {["Dine-in", "Takeaway (collection + delivery)", "Collection", "Delivery"].map(c => <tr key={c} className="text-muted-foreground"><td className="pr-4">{c}</td><td className="pr-4" colSpan={3}>Not available — received Captiva data has no order-channel field</td></tr>)}
            </tbody></table></div>;
          })()}
        </div>;
      })}
      {rows.length ? <>
        <div className="max-h-[32rem] overflow-auto rounded-md border border-border">
          <table className="w-full min-w-[680px] text-left text-sm"><thead className="sticky top-0 bg-muted"><tr>
            {["Product", "Restaurant", "Quantity", "Gross", "Type", "Source"].map(label => <th className="px-3 py-3 font-medium" key={label}>{label}</th>)}
          </tr></thead><tbody>{rows.slice(0, limit).map(p => <tr key={p.key} className="border-t border-border">
            <td className="px-3 py-2.5">{p.name}</td><td className="px-3 py-2.5">{data.locations.find(l => l.id === p.locationId)?.name}</td>
            <td className="px-3 py-2.5 tabular-nums">{p.quantity ?? "Unknown"}{p.source !== "Posted" && p.quantity != null && <span className="block text-xs text-muted-foreground">provisional</span>}</td><td className="px-3 py-2.5 tabular-nums">{p.gross != null ? formatCurrency(p.gross) : "Not available"}</td><td className="px-3 py-2.5">{PRODUCT_CLASS_LABEL[p.classification]}</td>
            <td className="px-3 py-2.5"><Badge variant="outline">{p.source}</Badge>{p.observationType && <span className="block text-xs text-muted-foreground">{p.observationType}</span>}</td>
          </tr>)}</tbody></table>
        </div>
        <p className="text-xs text-muted-foreground">{Math.min(limit, rows.length)} of {rows.length} products. Dishes & drinks hides kitchen notes (including generic product IDs reused for free-text instructions), modifiers, voids and refunds; each description is listed separately, never grouped by a shared ID. Journal record types stay separate and rankings remain provisional.</p>
        {limit < rows.length && <Button variant="outline" className="h-11" onClick={() => setLimit(v => v + 100)}>Show more products</Button>}
      </> : <p className="text-sm text-muted-foreground">{data.products.length ? "No products match these filters." : "No product detail available for this selection. Received daily totals above remain valid; missing detail is not zero sales."}</p>}
    </>}
  </section>;
}