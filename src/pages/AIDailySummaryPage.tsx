import { useState, useMemo } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocation } from "@/contexts/LocationContext";
import { useLocations } from "@/hooks/useLocations";
import { format, subDays, parseISO } from "date-fns";
import {
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronRight,
  Calendar,
  MapPin,
  Euro,
  ShoppingBag,
  Users,
  TrendingUp,
  Percent,
  RefreshCw,
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface AISummary {
  id: string;
  restaurant_id: string;
  location_id: string | null;
  summary_date: string;
  summary_text: string;
  metrics_json: any;
  created_at: string;
}

export default function AIDailySummaryPage() {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const { data: locations = [] } = useLocations();
  const queryClient = useQueryClient();
  const restaurantId = currentRestaurant?.id;

  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("7");

  const fromDate = format(subDays(new Date(), Number(dateRange)), "yyyy-MM-dd");
  const toDate = format(new Date(), "yyyy-MM-dd");

  // Fetch existing summaries
  const { data: summaries = [], isLoading } = useQuery({
    queryKey: ["ai-daily-summaries", restaurantId, filterLocation, fromDate, toDate],
    queryFn: async () => {
      if (!restaurantId) return [];
      let q = supabase
        .from("daily_ai_summaries")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .gte("summary_date", fromDate)
        .lte("summary_date", toDate)
        .order("summary_date", { ascending: false });

      if (filterLocation && filterLocation !== "all") {
        q = q.eq("location_id", filterLocation);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as AISummary[];
    },
    enabled: !!restaurantId,
  });

  // Generate summary for a specific date
  const generateMutation = useMutation({
    mutationFn: async (date: string) => {
      const { data, error } = await supabase.functions.invoke("ai-daily-summary", {
        body: {
          date,
          restaurant_id: restaurantId,
          location_id: filterLocation !== "all" ? filterLocation : null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-daily-summaries"] });
      toast.success("Summary generated successfully");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to generate summary");
    },
  });

  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const hasYesterdaySummary = summaries.some((s) => s.summary_date === yesterday);

  return (
    <PageLayout title="AI Daily Summary" subtitle="AI-generated operational summaries based on real data">
      <div className="space-y-4">
        {/* Filters & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <Select value={filterLocation} onValueChange={setFilterLocation}>
              <SelectTrigger className="w-[180px] h-8 text-sm">
                <SelectValue placeholder="All Locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[140px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => generateMutation.mutate(yesterday)}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {hasYesterdaySummary ? "Regenerate Yesterday" : "Generate Yesterday's Summary"}
          </Button>
        </div>

        {/* Summaries List */}
        {isLoading ? (
          <div className="text-muted-foreground text-sm">Loading summaries…</div>
        ) : summaries.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Sparkles className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">No summaries generated yet.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Click "Generate Yesterday's Summary" to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {summaries.map((summary) => (
              <SummaryCard key={summary.id} summary={summary} locations={locations} />
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

function SummaryCard({
  summary,
  locations,
}: {
  summary: AISummary;
  locations: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const m = summary.metrics_json || {};
  const dateLabel = format(parseISO(summary.summary_date), "EEE dd MMM yyyy");
  const locationName = summary.location_id
    ? locations.find((l) => l.id === summary.location_id)?.name || "Unknown"
    : "All Locations";

  const isNoData = summary.summary_text === "No operational data available.";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                {open ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium text-sm">{dateLabel}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {locationName}
                </Badge>
                {isNoData && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    No Data
                  </Badge>
                )}
              </div>
              {!isNoData && (
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Euro className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{formatCurrency(m.revenue || 0)}</span>
                  </div>
                  <div className="flex items-center gap-1 hidden sm:flex">
                    <ShoppingBag className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{m.orders || 0}</span>
                  </div>
                  <div className="flex items-center gap-1 hidden md:flex">
                    <TrendingUp className="h-3 w-3 text-success" />
                    <span className="font-medium text-success">{formatCurrency(m.estimated_profit || 0)}</span>
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4 space-y-4">
            {/* Metrics Grid */}
            {!isNoData && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <MetricChip label="Revenue" value={formatCurrency(m.revenue || 0)} icon={Euro} />
                <MetricChip label="Orders" value={String(m.orders || 0)} icon={ShoppingBag} />
                <MetricChip label="Avg Order" value={formatCurrency(m.avg_order_value || 0)} icon={ShoppingBag} />
                <MetricChip label="Food Cost" value={`${m.food_cost_pct || 0}%`} icon={Percent} />
                <MetricChip label="Labour" value={`${(m.labour_pct || 0).toFixed(1)}%`} icon={Percent} />
                <MetricChip label="Profit" value={formatCurrency(m.estimated_profit || 0)} icon={TrendingUp} />
                {m.covers > 0 && <MetricChip label="Covers" value={String(m.covers)} icon={Users} />}
                {m.reservations > 0 && <MetricChip label="Bookings" value={String(m.reservations)} icon={Calendar} />}
              </div>
            )}

            {/* Top/Bottom Dishes */}
            {!isNoData && m.top_dishes?.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Top Dishes</h4>
                  {m.top_dishes.map((d: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="truncate">{d.name}</span>
                      <span className="text-muted-foreground shrink-0 ml-2">{d.quantity} sold</span>
                    </div>
                  ))}
                </div>
                {m.bottom_dishes?.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Worst Performers
                    </h4>
                    {m.bottom_dishes.map((d: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="truncate">{d.name}</span>
                        <span className="text-muted-foreground shrink-0 ml-2">{d.quantity} sold</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* AI Text */}
            <div className="rounded-md border border-border bg-secondary/20 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  AI Analysis
                </span>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm">
                {summary.summary_text}
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function MetricChip({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Euro;
}) {
  return (
    <div className="rounded-md border border-border p-2 text-center">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
