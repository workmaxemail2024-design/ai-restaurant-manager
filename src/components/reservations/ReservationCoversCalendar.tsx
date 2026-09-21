import { useMemo } from "react";
import { format, isSameMonth } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { countsAsBookedCovers, type Reservation } from "@/hooks/useReservations";

interface ReservationCoversCalendarProps {
  month: Date;
  selected: Date;
  reservations: Reservation[];
  onMonthChange: (month: Date) => void;
  onSelect: (date: Date) => void;
}

export function ReservationCoversCalendar({
  month,
  selected,
  reservations,
  onMonthChange,
  onSelect,
}: ReservationCoversCalendarProps) {
  const coversByDate = useMemo(() => {
    const totals = new Map<string, number>();
    reservations.forEach(reservation => {
      if (!countsAsBookedCovers(reservation.status)) return;
      const key = format(new Date(reservation.start_at), "yyyy-MM-dd");
      totals.set(key, (totals.get(key) ?? 0) + reservation.party_size);
    });
    return totals;
  }, [reservations]);

  return (
    <div className="mx-auto w-full max-w-3xl rounded-md border bg-card p-3 sm:p-5">
      <Calendar
        mode="single"
        month={month}
        selected={selected}
        onMonthChange={onMonthChange}
        onSelect={date => date && onSelect(date)}
        className="w-full p-0"
        classNames={{
          months: "w-full",
          month: "w-full space-y-4",
          table: "w-full border-collapse",
          head_row: "grid grid-cols-7",
          head_cell: "text-muted-foreground text-center font-normal text-xs py-2",
          row: "grid grid-cols-7 mt-1",
          cell: "relative h-[72px] p-0 text-center focus-within:z-20",
          day: "h-[72px] w-full rounded-md p-2 text-left text-sm font-normal hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-selected:bg-primary aria-selected:text-primary-foreground",
          day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
          day_today: "border border-primary/50",
          day_outside: "text-muted-foreground opacity-40",
        }}
        components={{
          DayContent: ({ date, displayMonth }) => {
            const covers = coversByDate.get(format(date, "yyyy-MM-dd")) ?? 0;
            return (
              <span className="flex h-full flex-col justify-between">
                <span>{format(date, "d")}</span>
                {covers > 0 && isSameMonth(date, displayMonth) && (
                  <span className="self-start rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                    {covers} covers
                  </span>
                )}
              </span>
            );
          },
        }}
      />
      <p className="mt-3 text-xs text-muted-foreground">Booked Covers exclude cancelled, declined and no-show reservations.</p>
    </div>
  );
}
