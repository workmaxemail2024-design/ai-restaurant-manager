import { useState } from "react";
import { useProductsSold } from "@/hooks/useProductsSold";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { formatOrdinalRange } from "@/lib/ordinalDate";
import { rankProducts, type RankingKind } from "@/lib/productsSold";

/** Reports keeps compact dish/drink rankings for its chosen reporting range only. */
export function ProductsSoldPanel({ start, end }: { start: string; end: string }) {
  const query = useProductsSold(start, end);
  const [kind, setKind] = useState<RankingKind>("both");
  const data = query.data;

  if (query.isError) return <p role="alert" className="text-sm text-destructive">Dish and drink rankings could not be loaded.</p>;
  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading dish and drink rankings…</p>;
  if (!data || !data.products.some(product => product.rankable)) return null;

  const top = rankProducts(data.products, kind, "top");
  const bottom = rankProducts(data.products, kind, "bottom");
  const multipleLocations = data.locations.length > 1;
  const locationName = (id: string) => data.locations.find(location => location.id === id)?.name ?? "Restaurant";

  return <section aria-label="Top and bottom dishes and drinks" className="min-w-0 space-y-3 rounded-lg border border-border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-base font-semibold">Top & bottom dishes and drinks</h2><p className="text-xs text-muted-foreground">{formatOrdinalRange(start, end)}</p></div>
      <SegmentedControl value={kind} onChange={(value: RankingKind) => setKind(value)} ariaLabel="Ranking products" className="w-full max-w-sm"
        options={[{ value: "food", label: "Food" }, { value: "drinks", label: "Drinks" }, { value: "both", label: "Both" }]} />
    </div>
    {!top.length ? <p className="text-sm text-muted-foreground">No rankable quantities for this selection. Missing detail is not zero.</p>
      : <div className="grid gap-4 md:grid-cols-2">
        {([["Top 10 by units sold", top], ["Bottom 10 by units sold", bottom]] as const).map(([title, list]) => <div key={title} className="min-w-0 rounded-md border border-border">
          <h3 className="border-b border-border px-3 py-2 text-sm font-medium">{title}</h3>
          <ol className="divide-y divide-border text-sm">{list.map((product, index) => <li key={product.key} className="flex justify-between gap-3 px-3 py-2">
            <span className="min-w-0">{index + 1}. {product.name}{multipleLocations && <span className="block text-xs text-muted-foreground">{locationName(product.locationId)}</span>}</span>
            <span className="shrink-0 text-right tabular-nums">{product.quantity} units{product.source !== "Posted" && <span className="block text-xs text-muted-foreground">provisional</span>}</span>
          </li>)}</ol>
        </div>)}
      </div>}
    <p className="text-xs text-muted-foreground">Known positive units only; notes, modifiers, voids and unknown quantities are excluded.</p>
  </section>;
}
