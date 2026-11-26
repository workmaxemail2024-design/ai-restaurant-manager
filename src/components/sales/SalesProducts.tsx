import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { useProductsSold } from "@/hooks/useProductsSold";
import { formatCurrency } from "@/lib/currency";
import { formatOrdinalRange } from "@/lib/ordinalDate";
import { PRODUCT_CLASS_LABEL } from "@/lib/productClassification";
import type { SoldProduct } from "@/lib/productsSold";

interface ProductTableProps {
  products: SoldProduct[];
  locations: Array<{ id: string; name: string }>;
}

function ProductTable({ products, locations }: ProductTableProps) {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(50);
  const multipleLocations = locations.length > 1;
  const rows = useMemo(() => products
    .filter(product => product.category === "dish_drink" && product.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (b.quantity ?? -Infinity) - (a.quantity ?? -Infinity) || a.name.localeCompare(b.name)),
  [products, search]);

  return <div className="space-y-3">
    <div className="relative max-w-md">
      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <Input
        aria-label="Search dishes and drinks"
        placeholder="Search dishes and drinks"
        value={search}
        onChange={event => { setSearch(event.target.value); setLimit(50); }}
        className="h-11 pl-9"
      />
    </div>
    {rows.length === 0 ? <p className="text-sm text-muted-foreground">No dishes or drinks match this search.</p> : <>
      <div className="max-h-[30rem] overflow-auto rounded-md border border-border">
        <table className="w-full min-w-[540px] text-left text-sm">
          <thead className="sticky top-0 bg-muted"><tr>
            <th className="px-3 py-3 font-medium">Dish or drink</th>
            {multipleLocations && <th className="px-3 py-3 font-medium">Restaurant</th>}
            <th className="px-3 py-3 text-right font-medium">Units</th>
            <th className="px-3 py-3 text-right font-medium">Actual gross</th>
            <th className="px-3 py-3 font-medium">Source</th>
          </tr></thead>
          <tbody>{rows.slice(0, limit).map(product => <tr key={product.key} className="border-t border-border">
            <td className="px-3 py-2.5">{product.name}<span className="block text-xs text-muted-foreground">{PRODUCT_CLASS_LABEL[product.classification]}</span></td>
            {multipleLocations && <td className="px-3 py-2.5">{locations.find(location => location.id === product.locationId)?.name ?? "Restaurant"}</td>}
            <td className="px-3 py-2.5 text-right tabular-nums">{product.quantity == null ? "Unknown" : product.quantity}{product.source !== "Posted" && product.quantity != null && <span className="block text-xs text-muted-foreground">provisional</span>}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{product.gross == null ? "Unavailable" : formatCurrency(product.gross)}</td>
            <td className="px-3 py-2.5"><Badge variant="outline">{product.source}</Badge></td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Showing {Math.min(limit, rows.length)} of {rows.length} dishes and drinks. Missing quantities or gross amounts are not zero.</p>
      {limit < rows.length && <Button type="button" variant="outline" className="h-11" onClick={() => setLimit(value => value + 100)}>Show more</Button>}
    </>}
  </div>;
}

export function DayProductsSold({ date, locationId }: { date: string; locationId: string }) {
  const query = useProductsSold(date, date, locationId);
  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading dishes and drinks…</p>;
  if (query.isError) return <p role="alert" className="text-sm text-destructive">Item details unavailable for this day.</p>;
  const products = (query.data?.products ?? []).filter(product => product.category === "dish_drink");
  if (!products.length) return <p className="text-sm text-muted-foreground">Item and takeaway breakdown unavailable for this day.</p>;
  return <ProductTable products={products} locations={query.data?.locations ?? []} />;
}

function RangeProductsContent({ start, end }: { start: string; end: string }) {
  const query = useProductsSold(start, end);
  if (query.isLoading) return <p className="py-3 text-sm text-muted-foreground">Loading products sold…</p>;
  if (query.isError) return <p role="alert" className="py-3 text-sm text-destructive">Products sold could not be loaded. Missing detail is not zero.</p>;
  const products = (query.data?.products ?? []).filter(product => product.category === "dish_drink");
  if (!products.length) return <p className="py-3 text-sm text-muted-foreground">No dish or drink detail is available for this period.</p>;
  return <div className="py-3"><ProductTable products={products} locations={query.data?.locations ?? []} /></div>;
}

export function RangeProductsSold({ start, end }: { start: string; end: string }) {
  const [open, setOpen] = useState(false);
  return <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border">
    <CollapsibleTrigger asChild>
      <button type="button" className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30" aria-expanded={open}>
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="min-w-0 flex-1"><span className="block font-medium">Products sold in selected period</span><span className="block text-xs text-muted-foreground">{formatOrdinalRange(start, end)}</span></span>
        <span className="text-sm text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>
    </CollapsibleTrigger>
    <CollapsibleContent className="border-t border-border px-4 pb-4">
      {open && <RangeProductsContent start={start} end={end} />}
    </CollapsibleContent>
  </Collapsible>;
}
