import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocation } from "@/contexts/LocationContext";
import { formatCurrency } from "@/lib/currency";
import type { ReportsPeriodSummary } from "@/lib/reportsMonthly";

interface ActualFoodCost {
  status: "complete" | "estimate";
  reasons: string[];
  revenue: number;
  opening_value: number;
  closing_value: number;
  receipts_value: number;
  waste_value: number;
  actual_cogs: number;
  theoretical_cogs: number;
  unexplained_variance: number;
  non_food: { usage: number; receipts_value: number; waste_value: number };
}

/** Live (no snapshot) actual vs theoretical food & beverage cost for a period. Additive; existing figures unchanged. */
export function useActualFoodCost(start: string, end: string) {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const rid = currentRestaurant?.id;
  return useQuery({
    queryKey: ["actual-food-cost", rid, selectedLocationId ?? "all", start, end],
    enabled: !!rid && !!start && !!end,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_period_actual_food_cost", {
        p_restaurant_id: rid!, p_location_id: selectedLocationId ?? undefined, p_start: start, p_end: end,
      } as any);
      if (error) throw error;
      return data as unknown as ActualFoodCost;
    },
  });
}

const pct = (v: number, rev: number) => (rev > 0 ? `${((v / rev) * 100).toFixed(1)}%` : "—");

export function ActualVsTheoreticalBlock({ month, weeks }: { month: ReportsPeriodSummary; weeks: ReportsPeriodSummary[] }) {
  const [key, setKey] = useState("month");
  const period = key === "month" ? month : weeks.find((w) => w.key === key) ?? month;
  const { data, isLoading, error } = useActualFoodCost(period.startDate, period.endDate);
  const rev = period.revenue;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            Actual vs theoretical food & beverage cost
            {data && (data.status === "complete"
              ? <Badge variant="outline" className="border-success text-success"><CheckCircle2 className="h-3 w-3 mr-1" />Complete</Badge>
              : <Badge variant="outline" className="border-warning text-warning"><AlertTriangle className="h-3 w-3 mr-1" />Estimate</Badge>)}
          </span>
          <Select value={key} onValueChange={setKey}>
            <SelectTrigger className="h-11 w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Whole month</SelectItem>
              {weeks.map((w) => <SelectItem key={w.key} value={w.key}>Week {w.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading ? <p className="text-muted-foreground">Calculating…</p>
          : error ? <p className="text-destructive">{(error as Error).message}</p>
          : data && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div><p className="text-muted-foreground">Actual cost of goods</p><p className="text-lg font-semibold">{formatCurrency(data.actual_cogs)}</p><p className="text-xs text-muted-foreground">{pct(data.actual_cogs, rev)} of revenue</p></div>
                <div><p className="text-muted-foreground">Theoretical (recipes × sales)</p><p className="text-lg font-semibold">{formatCurrency(data.theoretical_cogs)}</p><p className="text-xs text-muted-foreground">{pct(data.theoretical_cogs, rev)}</p></div>
                <div><p className="text-muted-foreground">Recorded waste</p><p className="text-lg font-semibold">{formatCurrency(data.waste_value)}</p></div>
                <div><p className="text-muted-foreground">Unexplained variance</p><p className="text-lg font-semibold">{formatCurrency(data.unexplained_variance)}</p></div>
              </div>
              <p className="text-xs text-muted-foreground">
                Opening stock {formatCurrency(data.opening_value)} + deliveries {formatCurrency(data.receipts_value)} − closing stock {formatCurrency(data.closing_value)}.
                Non-food (cleaning, packaging, other) kept separate: used {formatCurrency(data.non_food.usage)}.
              </p>
              {data.status === "estimate" && data.reasons.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-warning">
                  {data.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              )}
            </>
          )}
      </CardContent>
    </Card>
  );
}
