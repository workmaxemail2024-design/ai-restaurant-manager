import { ArrowDown, ArrowUp } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatUnitCost } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { PriceCompare } from "@/lib/stockListImport";

const perBig = (base: number | null, unit: string | null) => {
  if (base == null || !unit) return "Unknown";
  if (unit === "g") return `${formatCurrency(base * 1000)}/kg`;
  if (unit === "ml") return `${formatCurrency(base * 1000)}/L`;
  return `${formatUnitCost(base)}/each`;
};

interface Props {
  cmp: PriceCompare;
  supplierName: string;
  newPackCost: number | null;
  baseUnit: string | null;
  recordChoice: "record" | "keep" | undefined;
  onRecordChoice: (v: "record" | "keep" | undefined) => void;
  /** null = master update not offered (reason shown). */
  masterOffer: { allowed: true } | { allowed: false; reason: string } | null;
  masterChecked: boolean;
  onMasterChecked: (v: boolean) => void;
}

/** Previous vs new supplier price, with two separate explicit decisions. */
export function PriceChangePanel({ cmp, supplierName, newPackCost, baseUnit, recordChoice, onRecordChoice, masterOffer, masterChecked, onMasterChecked }: Props) {
  const changed = cmp.kind === "up" || cmp.kind === "down";
  return (
    <div className="space-y-2 text-xs">
      {changed && (
        <div className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold",
          cmp.kind === "up" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary")}>
          {cmp.kind === "up" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          {cmp.pct != null ? `${cmp.pct > 0 ? "+" : ""}${cmp.pct.toFixed(1)}%` : ""} · {cmp.diffPack! > 0 ? "+" : ""}{formatCurrency(cmp.diffPack!)}
        </div>
      )}
      {cmp.prev && (
        <div className="grid grid-cols-[auto_1fr] gap-x-2 text-muted-foreground">
          <span>Supplier</span><span className="text-foreground">{supplierName}</span>
          <span>Previous</span><span className="text-foreground">{formatCurrency(Number(cmp.prev.cost_per_pack))} / {cmp.prev.pack_size} {cmp.prev.pack_unit} · {perBig(cmp.prevBase, cmp.prev.base_unit)} <span className="text-muted-foreground">({cmp.prev.effective_date})</span></span>
          <span>New</span><span className="text-foreground">{newPackCost != null ? formatCurrency(newPackCost) : "Unknown"} · {perBig(cmp.newBase, baseUnit)}</span>
        </div>
      )}
      {cmp.kind === "same" && <div className="text-muted-foreground">Same as supplier price in force — not recorded again.</div>}
      {cmp.kind === "no_previous" && <div className="text-muted-foreground">No previous supplier price on this date — will be recorded.</div>}
      {cmp.kind === "not_comparable" && <div className="text-warning">{cmp.reason} — no % shown.</div>}
      {cmp.newer && (
        <div className="text-warning">
          Historical list — a newer supplier price ({formatCurrency(Number(cmp.newer.cost_per_pack))}, {cmp.newer.effective_date}) exists and stays current.
        </div>
      )}
      {changed && (
        <Select value={recordChoice ?? "_undecided"} onValueChange={(v) => onRecordChoice(v === "_undecided" ? undefined : (v as "record" | "keep"))}>
          <SelectTrigger className={cn("h-11 min-w-56", !recordChoice && "border-warning")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_undecided">Supplier price: choose…</SelectItem>
            <SelectItem value="record">Record new supplier price</SelectItem>
            <SelectItem value="keep">Leave supplier price unchanged</SelectItem>
          </SelectContent>
        </Select>
      )}
      {changed && masterOffer && (masterOffer.allowed ? (
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2">
          <Checkbox checked={masterChecked} onCheckedChange={(v) => onMasterChecked(v === true)} className="h-5 w-5" />
          <span>Also update the master cost used in recipes (new dated entry)</span>
        </label>
      ) : (
        <div className="text-muted-foreground">Master recipe cost: {"reason" in masterOffer ? masterOffer.reason : ""}</div>
      ))}
    </div>
  );
}
