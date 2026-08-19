import { formatCurrency } from "@/lib/currency";
import type { StaffDepartment } from "@/lib/labour";

interface Props {
  totalHours: number;
  totalCost: number;
  hourlyCost: number;
  salaryCost: number;
  deptCosts: Record<StaffDepartment, number>;
  labourPct: number | null;
  canSeeCosts: boolean;
}

/** Calculated labour totals shown at the top and bottom of Review Labour. */
export function LabourTotals({
  totalHours,
  totalCost,
  hourlyCost,
  salaryCost,
  deptCosts,
  labourPct,
  canSeeCosts,
}: Props) {
  const money = (v: number) => (canSeeCosts ? formatCurrency(v) : "—");

  const tiles: { label: string; value: string; sub?: string }[] = [
    { label: "Total hours", value: totalHours.toFixed(2) },
    { label: "Floor labour", value: money(deptCosts.floor) },
    { label: "Kitchen labour", value: money(deptCosts.kitchen) },
    {
      label: "Management / Other",
      value: money(deptCosts.management + deptCosts.other),
    },
    {
      label: "Total labour cost",
      value: money(totalCost),
      sub: canSeeCosts && salaryCost > 0
        ? `${formatCurrency(hourlyCost)} hourly + ${formatCurrency(salaryCost)} salary`
        : undefined,
    },
    {
      label: "Labour % of revenue",
      value: canSeeCosts && labourPct != null ? `${labourPct.toFixed(1)}%` : "—",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{t.label}</p>
          <p className="text-lg font-semibold">{t.value}</p>
          {t.sub && <p className="text-[11px] text-muted-foreground">{t.sub}</p>}
        </div>
      ))}
    </div>
  );
}
