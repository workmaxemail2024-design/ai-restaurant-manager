import { useMemo } from "react";
import { Clock, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  STATUS_LABELS,
  type Reservation,
  type ReservationStatus,
  type ReservationTable,
} from "@/hooks/useReservations";

interface LiveFloorPlanProps {
  tables: ReservationTable[];
  reservations: Reservation[];
  selectedReservationId: string | null;
  selectedLocationId: string | null;
  onSelectReservation: (reservation: Reservation) => void;
}

const ACTIVE_STATUSES: ReservationStatus[] = ["pending", "confirmed", "arrived", "seated"];

function tableReservation(tableId: string, reservations: Reservation[], selectedId: string | null) {
  const assigned = reservations.filter(
    reservation => ACTIVE_STATUSES.includes(reservation.status) && reservation.table_ids.includes(tableId),
  );
  const selected = assigned.find(reservation => reservation.id === selectedId);
  if (selected) return selected;

  const statusPriority: Partial<Record<ReservationStatus, number>> = { seated: 0, arrived: 1, confirmed: 2, pending: 3 };
  const now = Date.now();
  return assigned.sort((a, b) => {
    const priorityDifference = (statusPriority[a.status] ?? 9) - (statusPriority[b.status] ?? 9);
    if (priorityDifference !== 0) return priorityDifference;
    const aDistance = Math.abs(new Date(a.start_at).getTime() - now);
    const bDistance = Math.abs(new Date(b.start_at).getTime() - now);
    return aDistance - bDistance;
  })[0];
}

function tableStateClass(status?: ReservationStatus) {
  if (status === "seated") return "border-primary bg-primary/20 text-primary";
  if (status === "arrived") return "border-warning bg-warning/15 text-warning";
  if (status === "confirmed" || status === "pending") return "border-secondary bg-secondary/70 text-foreground";
  return "border-success/50 bg-success/10 text-foreground";
}

export function LiveFloorPlan({
  tables,
  reservations,
  selectedReservationId,
  selectedLocationId,
  onSelectReservation,
}: LiveFloorPlanProps) {
  const activeTables = useMemo(
    () => tables.filter(table => table.is_active && (!selectedLocationId || table.location_id === selectedLocationId)),
    [selectedLocationId, tables],
  );
  const canvasWidth = Math.max(600, ...activeTables.map(table => Number(table.x) + Number(table.w) + 24));
  const canvasHeight = Math.max(500, ...activeTables.map(table => Number(table.y) + Number(table.h) + 24));

  if (!selectedLocationId) {
    return (
      <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
        <MapPin className="h-6 w-6" />
        <p className="text-sm font-medium text-foreground">Select a location to view its floor</p>
        <p className="text-xs">The booking list can still show all permitted locations.</p>
      </div>
    );
  }

  if (activeTables.length === 0) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
        No active tables are configured for this location.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-success" />Available</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-secondary" />Reserved</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-warning" />Arrived</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" />Seated</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="relative min-h-[360px] w-full overflow-hidden rounded-md border bg-muted/20" style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}>
          {activeTables.map(table => {
            const relevant = tableReservation(table.id, reservations, selectedReservationId);
            const isSelected = relevant?.id === selectedReservationId;
            return (
              <button
                key={table.id}
                type="button"
                disabled={!relevant}
                onClick={() => relevant && onSelectReservation(relevant)}
                aria-label={`${table.name}, ${table.seats} seats${relevant ? `, ${STATUS_LABELS[relevant.status]}` : ", available"}`}
                className={cn(
                  "absolute flex min-h-[44px] min-w-[44px] flex-col items-center justify-center border-2 px-1 text-center transition-[box-shadow,transform,border-color,background-color] disabled:cursor-default disabled:opacity-100",
                  table.shape === "circle" ? "rounded-full" : "rounded-md",
                  tableStateClass(relevant?.status),
                  isSelected && "z-20 scale-105 ring-4 ring-primary/35 shadow-lg",
                )}
                style={{
                  left: `${(Number(table.x) / canvasWidth) * 100}%`,
                  top: `${(Number(table.y) / canvasHeight) * 100}%`,
                  width: `${Math.max(8, (Number(table.w) / canvasWidth) * 100)}%`,
                  height: `${Math.max(9, (Number(table.h) / canvasHeight) * 100)}%`,
                }}
              >
                <span className="max-w-full truncate text-xs font-semibold">{table.name}</span>
                <span className="text-[10px] opacity-75">{table.seats} seats</span>
                {relevant && (
                  <span className="mt-0.5 flex max-w-full items-center gap-1 truncate text-[10px]">
                    <Clock className="h-2.5 w-2.5 shrink-0" />
                    {new Date(relevant.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="border-t px-4 py-2">
        <Badge variant="outline" className="text-[10px] font-normal">Read-only service view</Badge>
      </div>
    </div>
  );
}
