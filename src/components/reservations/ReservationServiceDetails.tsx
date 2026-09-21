import { differenceInMinutes, format, parseISO } from "date-fns";
import { CalendarDays, Clock, Mail, Phone, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import {
  checkTableConflicts,
  getNextActions,
  getTimestampPayload,
  STATUS_COLORS,
  STATUS_LABELS,
  useCustomerReservations,
  useUpdateReservation,
  type Reservation,
  type ReservationStatus,
  type ReservationTable,
} from "@/hooks/useReservations";
import { cn } from "@/lib/utils";

interface ReservationServiceDetailsProps {
  reservation: Reservation | null;
  reservations: Reservation[];
  tables: ReservationTable[];
}

export function ReservationServiceDetails({ reservation, reservations, tables }: ReservationServiceDetailsProps) {
  const updateReservation = useUpdateReservation();
  const { data: history = [] } = useCustomerReservations(reservation?.customer_id);

  if (!reservation) {
    return (
      <div className="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center">
        <Users className="mb-3 h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-medium">Select a booking or occupied table</p>
        <p className="mt-1 text-xs text-muted-foreground">Guest details and service actions will appear here.</p>
      </div>
    );
  }

  const duration = differenceInMinutes(parseISO(reservation.end_at), parseISO(reservation.start_at));
  const tableNames = reservation.table_ids
    .map(tableId => tables.find(table => table.id === tableId)?.name)
    .filter(Boolean)
    .join(", ");
  const actions = getNextActions(reservation.status);
  const priorVisits = history.filter(item => item.id !== reservation.id && ["completed", "seated"].includes(item.status)).length;
  const noShows = history.filter(item => item.id !== reservation.id && item.status === "no_show").length;
  const lastVisit = history.find(item => item.id !== reservation.id && ["completed", "seated"].includes(item.status));

  const changeStatus = (status: ReservationStatus) => {
    if (["confirmed", "arrived"].includes(status) && reservation.table_ids.length > 0) {
      const conflicts = checkTableConflicts(
        reservations,
        reservation.table_ids,
        reservation.start_at,
        reservation.end_at,
        reservation.id,
      );
      if (conflicts.length > 0) {
        toast({ title: "Table conflict", description: "The assigned table is already booked at this time.", variant: "destructive" });
        return;
      }
    }

    if (status === "cancelled") {
      const reason = window.prompt("Cancellation reason (optional):");
      updateReservation.mutate({
        id: reservation.id,
        status,
        cancellation_reason: reason || null,
        ...getTimestampPayload(status),
      });
      return;
    }

    updateReservation.mutate({ id: reservation.id, status, ...getTimestampPayload(status) });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">
              {reservation.customer ? `${reservation.customer.first_name} ${reservation.customer.last_name}` : "Walk-in guest"}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">Party of {reservation.party_size}</p>
          </div>
          <Badge variant="outline" className={cn("shrink-0", STATUS_COLORS[reservation.status])}>
            {STATUS_LABELS[reservation.status]}
          </Badge>
        </div>

        {reservation.customer && (reservation.customer.phone || reservation.customer.email) && (
          <div className="mt-4 space-y-2 text-sm">
            {reservation.customer.phone && (
              <a className="flex min-h-11 items-center gap-2 text-muted-foreground hover:text-foreground" href={`tel:${reservation.customer.phone}`}>
                <Phone className="h-4 w-4" /> {reservation.customer.phone}
              </a>
            )}
            {reservation.customer.email && (
              <a className="flex min-h-11 items-center gap-2 break-all text-muted-foreground hover:text-foreground" href={`mailto:${reservation.customer.email}`}>
                <Mail className="h-4 w-4" /> {reservation.customer.email}
              </a>
            )}
          </div>
        )}

        <Separator className="my-4" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Time</p>
            <p className="mt-1 flex items-center gap-1.5 font-medium"><Clock className="h-4 w-4 text-primary" />{format(parseISO(reservation.start_at), "HH:mm")}–{format(parseISO(reservation.end_at), "HH:mm")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{duration} minutes</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tables</p>
            <p className="mt-1 font-medium">{tableNames || "Unassigned"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Sitting</p>
            <p className="mt-1 font-medium">{reservation.sitting?.name || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Source</p>
            <p className="mt-1 font-medium capitalize">{reservation.source.replace("_", " ")}</p>
          </div>
        </div>

        {(reservation.special_requests || reservation.customer?.notes) && (
          <>
            <Separator className="my-4" />
            <div className="space-y-3">
              {reservation.special_requests && (
                <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
                  <p className="text-xs font-semibold uppercase text-warning">Special requests</p>
                  <p className="mt-1 text-sm">{reservation.special_requests}</p>
                </div>
              )}
              {reservation.customer?.notes && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Guest notes</p>
                  <p className="mt-1 text-sm">{reservation.customer.notes}</p>
                </div>
              )}
            </div>
          </>
        )}

        {reservation.customer && (
          <>
            <Separator className="my-4" />
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Guest history</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border p-2"><p className="font-semibold">{priorVisits}</p><p className="text-[11px] text-muted-foreground">Visits</p></div>
                <div className="rounded-md border p-2"><p className={cn("font-semibold", noShows > 0 && "text-destructive")}>{noShows}</p><p className="text-[11px] text-muted-foreground">No-shows</p></div>
                <div className="rounded-md border p-2"><p className="font-semibold">{lastVisit ? format(parseISO(lastVisit.start_at), "d MMM") : "—"}</p><p className="text-[11px] text-muted-foreground">Last visit</p></div>
              </div>
            </div>
          </>
        )}

        {(reservation.arrived_at || reservation.seated_at || reservation.completed_at) && (
          <>
            <Separator className="my-4" />
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {reservation.arrived_at && <span>Arrived {format(parseISO(reservation.arrived_at), "HH:mm")}</span>}
              {reservation.seated_at && <span>Seated {format(parseISO(reservation.seated_at), "HH:mm")}</span>}
              {reservation.completed_at && <span>Completed {format(parseISO(reservation.completed_at), "HH:mm")}</span>}
            </div>
          </>
        )}
      </div>

      {actions.length > 0 && (
        <div className="border-t bg-card p-3">
          <div className="grid grid-cols-2 gap-2">
            {actions.map(action => (
              <Button
                key={action.status}
                className="min-h-12"
                variant={(action.variant as "default" | "outline" | "destructive") || "default"}
                disabled={updateReservation.isPending}
                onClick={() => changeStatus(action.status)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
