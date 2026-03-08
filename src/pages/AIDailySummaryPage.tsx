import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocation } from "@/contexts/LocationContext";
import { useLocations } from "@/hooks/useLocations";
import { useOwnerIntelligence } from "@/hooks/useOwnerIntelligence";
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
  BookOpen,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Shield,
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  const { data: intelligence } = useOwnerIntelligence(selectedLocationId);
  const queryClient = useQueryClient();
  const restaurantId = currentRestaurant?.id;

  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("7");

  const fromDate = format(subDays(new Date(), Number(dateRange)), "yyyy-MM-dd");
  const toDate = format(new Date(), "yyyy-MM-dd");

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
    <PageLayout
      title="Daily Summary Journal"
      subtitle="AI-generated manager briefings saved for each day of operations"
    >
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

        {/* Weekly Performance Summary */}
        {intelligence?.weeklySummary && (
          <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Weekly Performance</h3>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 ml-auto">
                  {intelligence.weeklySummary.confidence} confidence
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-3">{intelligence.weeklySummary.narrative}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-md border border-border p-2 text-center bg-background/60">
                  <p className={cn("text-lg font-bold", intelligence.weeklySummary.revenueChange >= 0 ? "text-success" : "text-destructive")}>
                    {intelligence.weeklySummary.revenueChange >= 0 ? "+" : ""}{intelligence.weeklySummary.revenueChange.toFixed(0)}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">Revenue</p>
                </div>
                <div className="rounded-md border border-border p-2 text-center bg-background/60">
                  <p className={cn("text-lg font-bold", intelligence.weeklySummary.ordersChange >= 0 ? "text-success" : "text-destructive")}>
                    {intelligence.weeklySummary.ordersChange >= 0 ? "+" : ""}{intelligence.weeklySummary.ordersChange.toFixed(0)}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">Orders</p>
                </div>
                {intelligence.weeklySummary.labourPctThis !== null && (
                  <div className="rounded-md border border-border p-2 text-center bg-background/60">
                    <p className="text-lg font-bold">{intelligence.weeklySummary.labourPctThis.toFixed(1)}%</p>
                    <p className="text-[10px] text-muted-foreground">Labour %</p>
                  </div>
                )}
                {intelligence.weeklySummary.foodCostPctThis !== null && (
                  <div className="rounded-md border border-border p-2 text-center bg-background/60">
                    <p className="text-lg font-bold">{intelligence.weeklySummary.foodCostPctThis.toFixed(1)}%</p>
                    <p className="text-[10px] text-muted-foreground">Food Cost %</p>
                  </div>
                )}
              </div>
              {intelligence.weeklySummary.missingData.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                  <Shield className="h-2.5 w-2.5" /> Missing: {intelligence.weeklySummary.missingData.join(", ")}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Summaries List */}
        {isLoading ? (
          <div className="text-muted-foreground text-sm">Loading summaries…</div>
        ) : summaries.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="font-medium">No summaries in this period</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Summaries are generated from daily sales, labour, and reservation data.
                Click "Generate Yesterday's Summary" if sales data exists for that day.
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

  // Data completeness assessment
  const dataChecks = [
    { label: "Sales", present: (m.revenue || 0) > 0 },
    { label: "Labour", present: (m.labour_hours || 0) > 0 },
    { label: "Covers", present: (m.covers || 0) > 0 },
    { label: "Expenses", present: (m.expenses || 0) > 0 },
    { label: "Bookings", present: (m.reservations || 0) > 0 },
  ];
  const presentCount = dataChecks.filter(d => d.present).length;
  const completeness = isNoData ? "none" : presentCount >= 4 ? "high" : presentCount >= 2 ? "medium" : "low";

  const completenessLabel = {
    high: "Complete",
    medium: "Partial Data",
    low: "Limited Data",
    none: "No Data",
  };
  const completenessColor = {
    high: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
    medium: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
    low: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    none: "bg-muted text-muted-foreground border-muted",
  };

  // Parse AI text into sections
  const parseSections = (text: string) => {
    const sections: { title: string; content: string[] }[] = [];
    let currentSection = { title: "AI Analysis", content: [] as string[] };
    
    text.split("\n").forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      // Detect section headers (lines ending with : or starting with ##)
      if ((trimmed.endsWith(":") && trimmed.length < 50 && !trimmed.startsWith("•") && !trimmed.startsWith("-")) || trimmed.startsWith("##")) {
        if (currentSection.content.length > 0) {
          sections.push({ ...currentSection });
        }
        currentSection = { title: trimmed.replace(/^#+\s*/, "").replace(/:$/, ""), content: [] };
      } else {
        currentSection.content.push(trimmed);
      }
    });
    if (currentSection.content.length > 0) {
      sections.push(currentSection);
    }
    return sections.length > 0 ? sections : [{ title: "AI Analysis", content: [text] }];
  };

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
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${completenessColor[completeness]}`}>
                  {completenessLabel[completeness]}
                </Badge>
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
            {/* Revenue & Orders Snapshot */}
            {!isNoData && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Euro className="h-3 w-3" /> Revenue & Orders
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricChip label="Revenue" value={formatCurrency(m.revenue || 0)} />
                  <MetricChip label="Orders" value={String(m.orders || 0)} />
                  <MetricChip label="Avg Order" value={formatCurrency(m.avg_order_value || 0)} />
                  <MetricChip label="Profit Est." value={formatCurrency(m.estimated_profit || 0)} />
                </div>
              </div>
            )}

            {/* Labour Notes */}
            {!isNoData && (m.labour_hours > 0 || m.labour_pct > 0) && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Users className="h-3 w-3" /> Labour
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {m.labour_hours > 0 && <MetricChip label="Hours" value={String(m.labour_hours)} />}
                  <MetricChip label="Labour %" value={`${(m.labour_pct || 0).toFixed(1)}%`} />
                  <MetricChip label="Food Cost %" value={`${m.food_cost_pct || 0}%`} />
                </div>
              </div>
            )}

            {/* Covers & Bookings */}
            {!isNoData && (m.covers > 0 || m.reservations > 0) && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <BookOpen className="h-3 w-3" /> Covers & Reservations
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {m.covers > 0 && <MetricChip label="Covers" value={String(m.covers)} />}
                  {m.reservations > 0 && <MetricChip label="Bookings" value={String(m.reservations)} />}
                </div>
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
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Worst Performers</h4>
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

            {/* Data Completeness */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <ClipboardCheck className="h-3 w-3" /> Data Completeness
              </h4>
              <div className="flex flex-wrap gap-2">
                {dataChecks.map((check) => (
                  <div key={check.label} className="flex items-center gap-1 text-xs">
                    {check.present ? (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 text-yellow-500" />
                    )}
                    <span className={check.present ? "text-foreground" : "text-muted-foreground"}>{check.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Analysis Sections */}
            <div className="rounded-md border border-border bg-secondary/20 p-3 space-y-3">
              {parseSections(summary.summary_text).map((section, i) => (
                <div key={i}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {section.title}
                    </span>
                  </div>
                  <div className="text-sm space-y-0.5">
                    {section.content.map((line, j) => (
                      <p key={j} className={line.startsWith("•") || line.startsWith("-") ? "text-muted-foreground pl-2" : ""}>
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2 text-center">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
