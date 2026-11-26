import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DayProductsSold } from "@/components/sales/SalesProducts";
import { useDailyPerformance } from "@/hooks/useDailyPerformance";
import { formatCurrency } from "@/lib/currency";
import type { DailyPerformanceDay } from "@/lib/dailyPerformance";
import { formatOrdinalDate, formatOrdinalRange } from "@/lib/ordinalDate";

function sourceLabel(source: DailyPerformanceDay["source"]) {
  if (source === "received") return "Captiva received";
  if (source === "mixed") return "Captiva + posted fallback";
  return "Posted fallback";
}

function DailyRow({ day, locationName }: { day: DailyPerformanceDay; locationName: string }) {
  const [open, setOpen] = useState(false);
  return <li className="rounded-md border border-border bg-background">
    <button
      type="button"
      className="flex min-h-12 w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left hover:bg-secondary/30"
      onClick={() => setOpen(value => !value)}
      aria-expanded={open}
      aria-label={`${formatOrdinalDate(day.date, true)}, ${locationName}: ${open ? "hide" : "show"} dishes and drinks`}
    >
      {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className="min-w-40 flex-1">
        <span className="block text-sm font-medium">{formatOrdinalDate(day.date, true)}</span>
        <span className="block text-xs text-muted-foreground">{locationName}</span>
      </span>
      <span className="min-w-28 text-right">
        <span className="block text-sm font-semibold tabular-nums">{day.gross == null ? "Gross unavailable" : formatCurrency(day.gross)}</span>
        <span className="block text-xs text-muted-foreground">gross</span>
      </span>
      <span className="min-w-20 text-right">
        <span className="block text-sm font-semibold tabular-nums">{day.orders ?? "—"}</span>
        <span className="block text-xs text-muted-foreground">orders</span>
      </span>
      <Badge variant="outline" className="text-[10px]">{sourceLabel(day.source)}</Badge>
      <span className="w-full text-xs text-muted-foreground sm:w-auto">{open ? "Hide items" : "View dishes & drinks"}</span>
    </button>
    {open && <div className="border-t border-border bg-muted/10 px-4 py-3"><DayProductsSold date={day.date} locationId={day.locationId} /></div>}
  </li>;
}

/** Sales' single daily-performance list: official received totals, posted fallback only. */
export function CaptivaDailyFigures({ start, end }: { start: string; end: string }) {
  const query = useDailyPerformance(start, end);
  const data = query.data;
  const days = data?.days ?? [];
  const locationName = (id: string) => data?.locations.find(location => location.id === id)?.name ?? "Restaurant";

  return <section className="space-y-3" aria-label="Daily performance">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><h2 className="text-base font-semibold">Daily performance</h2><p className="text-xs text-muted-foreground">{formatOrdinalRange(start, end)}</p></div>
      {data && days.length > 0 && <p className="text-sm"><strong>{data.totals.gross == null ? "Gross unavailable" : formatCurrency(data.totals.gross)}</strong> · {data.totals.orders ?? "—"} orders</p>}
    </div>
    {query.isError ? <p role="alert" className="text-sm text-destructive">Daily performance could not be loaded. Missing data is not zero.</p>
      : query.isLoading ? <p className="text-sm text-muted-foreground">Loading daily performance…</p>
      : !days.length ? <p className="rounded-md border border-border px-4 py-3 text-sm text-muted-foreground">No received Captiva totals or posted sales are available for this period.</p>
      : <>
        <p className="text-xs text-muted-foreground">Official Captiva gross and orders take precedence; posted figures are used only when received figures are missing. Days without data are not zero.</p>
        <ul className="space-y-2">{days.map(day => <DailyRow key={day.key} day={day} locationName={locationName(day.locationId)} />)}</ul>
      </>}
  </section>;
}
