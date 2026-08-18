import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { usePendingReservationCount } from "@/hooks/useReservations";

interface Props {
  startDate: string;
  endDate: string;
  locationId: string | null;
  periodLabel: string;
  isSingleDay: boolean;
}

/** Date/location aware bookings summary. Shows only what the data supports. */
export function DailyBookingsWidget({
  startDate,
  endDate,
  locationId,
  periodLabel,
  isSingleDay,
}: Props) {
  const navigate = useNavigate();
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  const { data: pendingReservations = 0 } = usePendingReservationCount();

  const { data } = useQuery({
    queryKey: ["dashboard-bookings", restaurantId, locationId ?? "all", startDate, endDate],
    queryFn: async () => {
      if (!restaurantId) return null;
      let q = supabase
        .from("reservations")
        .select("party_size, status, start_at, guest_name")
        .eq("restaurant_id", restaurantId)
        .gte("start_at", `${startDate}T00:00:00`)
        .lte("start_at", `${endDate}T23:59:59`)
        .not("status", "in", '("cancelled","declined","no_show")')
        .order("start_at", { ascending: true });
      if (locationId) q = q.eq("location_id", locationId);
      const { data: rows } = await q;
      const list = rows || [];

      const now = new Date();
      const upcoming = list.find((r) => new Date(r.start_at) > now) || null;

      // Peak period = hour slot with most covers (only if we have bookings)
      const byHour = new Map<number, number>();
      for (const r of list) {
        const h = new Date(r.start_at).getHours();
        byHour.set(h, (byHour.get(h) || 0) + (r.party_size || 0));
      }
      let peakHour: number | null = null;
      let peakCovers = 0;
      byHour.forEach((covers, hour) => {
        if (covers > peakCovers) {
          peakCovers = covers;
          peakHour = hour;
        }
      });

      return {
        count: list.length,
        covers: list.reduce((s, r) => s + (r.party_size || 0), 0),
        next: upcoming,
        peakHour,
        peakCovers,
      };
    },
    enabled: !!restaurantId,
    staleTime: 30000,
  });

  const nextLabel = data?.next
    ? `${format(parseISO(data.next.start_at), isSingleDay ? "HH:mm" : "d MMM HH:mm")}${
        data.next.guest_name ? ` · ${data.next.guest_name}` : ""
      }`
    : null;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold">Bookings · {periodLabel}</h3>
            {pendingReservations > 0 && (
              <Badge variant="destructive" className="text-xs">
                {pendingReservations} pending
              </Badge>
            )}
          </div>
          <Button
            variant="outline"
            className="h-10"
            onClick={() => navigate("/reservations")}
          >
            Review Bookings
          </Button>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Bookings</p>
            <p className="text-2xl font-bold mt-1">{data?.count ?? 0}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Covers booked</p>
            <p className="text-2xl font-bold mt-1">{data?.covers ?? 0}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Next booking</p>
            <p className="text-base font-semibold mt-1 truncate">{nextLabel ?? "—"}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Peak period</p>
            <p className="text-base font-semibold mt-1">
              {data?.peakHour != null
                ? `${String(data.peakHour).padStart(2, "0")}:00 · ${data.peakCovers} covers`
                : "—"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
