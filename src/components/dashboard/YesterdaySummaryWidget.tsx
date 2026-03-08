import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocation } from "@/contexts/LocationContext";
import { format, subDays } from "date-fns";
import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency } from "@/lib/currency";

export function YesterdaySummaryWidget() {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const restaurantId = currentRestaurant?.id;
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

  const { data: summary } = useQuery({
    queryKey: ["yesterday-summary-widget", restaurantId, selectedLocationId ?? "all", yesterday],
    queryFn: async () => {
      if (!restaurantId) return null;
      let q = supabase
        .from("daily_ai_summaries")
        .select("summary_text, metrics_json")
        .eq("restaurant_id", restaurantId)
        .eq("summary_date", yesterday);

      if (selectedLocationId) {
        q = q.eq("location_id", selectedLocationId);
      } else {
        q = q.is("location_id", null);
      }

      const { data } = await q.maybeSingle();
      return data;
    },
    enabled: !!restaurantId,
    staleTime: 60000,
  });

  if (!summary) return null;

  const m = (summary.metrics_json as any) || {};
  const isNoData = summary.summary_text === "No operational data available.";
  if (isNoData) return null;

  // Extract first sentence as condensed insight
  const firstSentence = summary.summary_text
    .replace(/^#+\s*.*/gm, "") // strip markdown headers
    .replace(/\*\*/g, "") // strip bold
    .trim()
    .split(/[.\n]/)[0];

  return (
    <Link to="/ai/daily-summary">
      <div className="rounded-xl bg-card border border-border p-4 hover:border-primary/30 transition-colors cursor-pointer animate-fade-in">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Yesterday's Summary</h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
          <span>Rev: <span className="text-foreground font-medium">{formatCurrency(m.revenue || 0)}</span></span>
          <span>Orders: <span className="text-foreground font-medium">{m.orders || 0}</span></span>
          <span>Profit: <span className="text-success font-medium">{formatCurrency(m.estimated_profit || 0)}</span></span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {firstSentence || "View full summary →"}
        </p>
      </div>
    </Link>
  );
}
