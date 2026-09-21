import { useEffect, useMemo, useState } from "react";
import { addMinutes, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Map, Plus, Search, Users } from "lucide-react";
import { PageLayout } from "@/components/common/PageLayout";
import { LiveFloorPlan } from "@/components/reservations/LiveFloorPlan";
import { ReservationCoversCalendar } from "@/components/reservations/ReservationCoversCalendar";
import { ReservationServiceDetails } from "@/components/reservations/ReservationServiceDetails";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useLocation } from "@/contexts/LocationContext";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocations } from "@/hooks/useLocations";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  checkCoverConflicts,
  checkTableConflicts,
  useCreateCustomer,
  useCreateReservation,
  useReservationCustomers,
  useReservations,
  useReservationSittings,
  useReservationTables,
  type Reservation,
  type ReservationCustomer,
  type ReservationSource,
} from "@/hooks/useReservations";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const EXCLUDED_BOOKED_COVER_STATUSES = new Set(["cancelled", "declined", "no_show"]);

function useWideServiceLayout() {
  const [isWide, setIsWide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsWide(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isWide;
}

export default function ReservationsPage() {
  const { startDate, setCustomRange } = useDateRange();
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const rid = currentRestaurant?.id;
  const isWide = useWideServiceLayout();
  const selectedDate = parseISO(startDate);
  const [calendarMonth, setCalendarMonth] = useState(startOfMonth(selectedDate));
  const [view, setView] = useState<"service" | "calendar">("service");
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showFloorSheet, setShowFloorSheet] = useState(false);
  const [showDetailSheet, setShowDetailSheet] = useState(false);

  const dayFrom = `${startDate}T00:00:00`;
  const dayTo = `${startDate}T23:59:59.999`;
  const monthFrom = `${format(startOfMonth(calendarMonth), "yyyy-MM-dd")}T00:00:00`;
  const monthTo = `${format(endOfMonth(calendarMonth), "yyyy-MM-dd")}T23:59:59.999`;

  const { data: reservations = [], isLoading } = useReservations(dayFrom, dayTo);
  const { data: monthReservations = [] } = useReservations(monthFrom, monthTo);
  const { data: tables = [] } = useReservationTables();
  const { data: sittings = [] } = useReservationSittings();
  const { data: customers = [] } = useReservationCustomers();
  const { data: locations = [] } = useLocations();

  const selectedReservation = useMemo(
    () => reservations.find(reservation => reservation.id === selectedReservationId) ?? null,
    [reservations, selectedReservationId],
  );

  useEffect(() => {
    if (selectedReservationId && !selectedReservation) setSelectedReservationId(null);
  }, [selectedReservation, selectedReservationId]);

  const sortedReservations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return [...reservations]
      .filter(reservation => {
        if (!query) return true;
        const guest = reservation.customer ? `${reservation.customer.first_name} ${reservation.customer.last_name}` : "walk-in";
        const tableNames = reservation.table_ids.map(tableId => tables.find(table => table.id === tableId)?.name ?? "").join(" ");
        return `${guest} ${reservation.customer?.phone ?? ""} ${tableNames}`.toLowerCase().includes(query);
      })
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [reservations, searchQuery, tables]);

  const bookedCovers = useMemo(
    () => reservations
      .filter(reservation => !EXCLUDED_BOOKED_COVER_STATUSES.has(reservation.status))
      .reduce((total, reservation) => total + reservation.party_size, 0),
    [reservations],
  );

  const moveDay = (offset: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + offset);
    const nextDate = format(next, "yyyy-MM-dd");
    setCustomRange(nextDate, nextDate);
    setSelectedReservationId(null);
  };

  const selectReservation = (reservation: Reservation) => {
    setSelectedReservationId(reservation.id);
    if (!isWide) setShowDetailSheet(true);
  };

  const selectCalendarDay = (date: Date) => {
    const value = format(date, "yyyy-MM-dd");
    setCustomRange(value, value);
    setSelectedReservationId(null);
    setView("service");
  };

  const currentLocation = locations.find(location => location.id === selectedLocationId);

  return (
    <PageLayout
      title="Bookings"
      subtitle="Live reservations, table status and guest details."
      action={
        <Button className="min-h-11" onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Booking
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={view} onValueChange={value => setView(value as "service" | "calendar")}>
          <TabsList className="h-11">
            <TabsTrigger value="service" className="min-h-10 px-4">Service</TabsTrigger>
            <TabsTrigger value="calendar" className="min-h-10 px-4">Calendar</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1 rounded-md border bg-card p-1">
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => moveDay(-1)} aria-label="Previous day">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <label className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              className="h-10 w-[168px] border-0 bg-transparent pl-9 font-medium shadow-none"
              value={startDate}
              onChange={event => event.target.value && setCustomRange(event.target.value, event.target.value)}
              aria-label="Booking date"
            />
          </label>
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => moveDay(1)} aria-label="Next day">
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {view === "calendar" ? (
        <ReservationCoversCalendar
          month={calendarMonth}
          selected={selectedDate}
          reservations={monthReservations}
          onMonthChange={setCalendarMonth}
          onSelect={selectCalendarDay}
        />
      ) : (
        <div className="grid min-h-[620px] grid-cols-1 gap-2 lg:h-[calc(100vh-10.5rem)] lg:min-h-[620px] lg:grid-cols-[minmax(185px,0.85fr)_minmax(285px,1.4fr)_minmax(205px,1fr)] xl:gap-3 xl:grid-cols-[minmax(250px,0.9fr)_minmax(390px,1.45fr)_minmax(280px,1fr)]">
          <section className="flex min-h-[540px] min-w-0 flex-col overflow-hidden rounded-md border bg-card lg:min-h-0">
            <div className="border-b p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{format(selectedDate, "EEE, d MMM")}</h2>
                  <p className="text-xs text-muted-foreground">{currentLocation?.name ?? "All permitted locations"}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-semibold text-primary">{bookedCovers}</p>
                  <p className="text-[11px] text-muted-foreground">Booked Covers</p>
                </div>
              </div>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input className="h-11 pl-9" placeholder="Search guest or table" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} />
              </div>
              {!isWide && (
                <Button variant="outline" className="mt-2 min-h-11 w-full" onClick={() => setShowFloorSheet(true)}>
                  <Map className="mr-2 h-4 w-4" /> Open live floor
                </Button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {isLoading ? (
                <p className="p-6 text-center text-sm text-muted-foreground">Loading bookings…</p>
              ) : sortedReservations.length === 0 ? (
                <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center">
                  <CalendarDays className="mb-3 h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">No bookings found</p>
                  <p className="mt-1 text-xs text-muted-foreground">No reservations match this day and search.</p>
                </div>
              ) : (
                sortedReservations.map(reservation => {
                  const selected = reservation.id === selectedReservationId;
                  const tableNames = reservation.table_ids.map(tableId => tables.find(table => table.id === tableId)?.name).filter(Boolean).join(", ");
                  return (
                    <button
                      key={reservation.id}
                      type="button"
                      onClick={() => selectReservation(reservation)}
                      className={cn(
                        "flex min-h-[76px] w-full items-center gap-3 border-b px-3 py-2 text-left transition-colors last:border-b-0",
                        selected ? "bg-primary/10 ring-inset ring-primary" : "hover:bg-muted/50",
                      )}
                    >
                      <div className="w-12 shrink-0 text-center">
                        <p className="font-semibold tabular-nums">{format(parseISO(reservation.start_at), "HH:mm")}</p>
                        <p className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground"><Users className="h-3 w-3" />{reservation.party_size}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{reservation.customer ? `${reservation.customer.first_name} ${reservation.customer.last_name}` : "Walk-in"}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{tableNames || "Table unassigned"}</p>
                      </div>
                      <Badge variant="outline" className={cn("max-w-[92px] shrink-0 truncate text-[10px]", STATUS_COLORS[reservation.status])}>
                        {STATUS_LABELS[reservation.status]}
                      </Badge>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="hidden min-h-0 min-w-0 overflow-hidden rounded-md border bg-card lg:block">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold">Live floor</h2>
              <p className="text-xs text-muted-foreground">{currentLocation?.name ?? "Choose a location above"}</p>
            </div>
            <div className="h-[calc(100%-61px)]">
              <LiveFloorPlan
                tables={tables}
                reservations={reservations}
                selectedReservationId={selectedReservationId}
                selectedLocationId={selectedLocationId}
                onSelectReservation={selectReservation}
              />
            </div>
          </section>

          <section className="hidden min-h-0 min-w-0 overflow-hidden rounded-md border bg-card lg:block">
            <ReservationServiceDetails reservation={selectedReservation} reservations={reservations} tables={tables} />
          </section>
        </div>
      )}

      <Sheet open={showFloorSheet} onOpenChange={setShowFloorSheet}>
        <SheetContent side="bottom" className="h-[82vh] p-0 lg:hidden">
          <SheetHeader className="border-b p-4 text-left"><SheetTitle>Live floor · {currentLocation?.name ?? "Select a location"}</SheetTitle></SheetHeader>
          <div className="h-[calc(100%-61px)]">
            <LiveFloorPlan
              tables={tables}
              reservations={reservations}
              selectedReservationId={selectedReservationId}
              selectedLocationId={selectedLocationId}
              onSelectReservation={reservation => {
                setSelectedReservationId(reservation.id);
                setShowFloorSheet(false);
                setShowDetailSheet(true);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showDetailSheet && !!selectedReservation} onOpenChange={setShowDetailSheet}>
        <SheetContent className="w-full overflow-hidden p-0 sm:max-w-md lg:hidden">
          <SheetHeader className="sr-only"><SheetTitle>Selected booking</SheetTitle></SheetHeader>
          <ReservationServiceDetails reservation={selectedReservation} reservations={reservations} tables={tables} />
        </SheetContent>
      </Sheet>

      <CreateReservationSheet
        open={showCreate}
        onClose={() => setShowCreate(false)}
        customers={customers}
        tables={tables}
        sittings={sittings}
        reservations={reservations}
        locations={locations}
        initialDate={startDate}
      />
    </PageLayout>
  );
}

// ── Create Reservation Sheet ──

function CreateReservationSheet({ open, onClose, customers, tables, sittings, reservations, locations, initialDate }: {
  open: boolean;
  onClose: () => void;
  customers: ReservationCustomer[];
  tables: any[];
  sittings: any[];
  reservations: Reservation[];
  locations: any[];
  initialDate: string;
}) {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const createRes = useCreateReservation();
  const createCust = useCreateCustomer();
  const rid = currentRestaurant?.id;

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [newCustomer, setNewCustomer] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("19:00");
  const [partySize, setPartySize] = useState(2);
  const [source, setSource] = useState<ReservationSource>('phone');
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [sittingId, setSittingId] = useState<string | null>(null);
  const [specialRequests, setSpecialRequests] = useState("");
  const [locationId, setLocationId] = useState(selectedLocationId || (locations.length > 0 ? locations[0].id : ''));

  const filteredCustomers = customerSearch.length >= 2
    ? customers.filter(c => `${c.first_name} ${c.last_name} ${c.phone || ''} ${c.email || ''}`.toLowerCase().includes(customerSearch.toLowerCase()))
    : [];

  const selectedSitting = sittings.find(s => s.id === sittingId);
  const duration = selectedSitting?.default_duration_minutes || 90;
  const startAt = new Date(`${date}T${time}:00`);
  const endAt = addMinutes(startAt, duration + (selectedSitting?.buffer_minutes || 0));

  const tableConflicts = selectedTableIds.length > 0
    ? checkTableConflicts(reservations, selectedTableIds, startAt.toISOString(), endAt.toISOString())
    : [];

  const coverCheck = checkCoverConflicts(reservations, sittingId, startAt.toISOString(), endAt.toISOString(), partySize, selectedSitting?.max_covers ?? null);

  // Check if selected tables have enough seats
  const selectedTableSeats = selectedTableIds.reduce((sum, tid) => {
    const t = tables.find(t => t.id === tid);
    return sum + (t?.seats || 0);
  }, 0);
  const capacityWarning = selectedTableIds.length > 0 && partySize > selectedTableSeats;

  const handleSubmit = async () => {
    if (!rid || !locationId) return;
    if (tableConflicts.length > 0) {
      const proceed = confirm(`Table(s) already booked at this time (${tableConflicts.length} conflict). Override?`);
      if (!proceed) return;
    }
    if (coverCheck.exceeds) {
      toast({ title: "Capacity exceeded", description: `Max covers (${selectedSitting?.max_covers}) would be exceeded.`, variant: "destructive" });
      return;
    }

    let custId = selectedCustomerId;
    if (newCustomer && firstName && lastName) {
      const c = await createCust.mutateAsync({
        restaurant_id: rid, location_id: locationId || null,
        first_name: firstName, last_name: lastName, phone: phone || null, email: email || null,
        marketing_opt_in: false, notes: null,
      });
      custId = c.id;
    }

    await createRes.mutateAsync({
      restaurant_id: rid,
      location_id: locationId,
      customer_id: custId,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      party_size: partySize,
      status: 'pending',
      source,
      table_ids: selectedTableIds,
      sitting_id: sittingId,
      special_requests: specialRequests || null,
      actual_spend: null,
      decline_reason: null,
      cancellation_reason: null,
      arrived_at: null,
      seated_at: null,
      completed_at: null,
      created_by: null,
    });
    onClose();
    setSelectedCustomerId(null); setNewCustomer(false); setFirstName(''); setLastName(''); setPhone(''); setEmail('');
    setSpecialRequests(''); setSelectedTableIds([]); setSittingId(null);
  };

  return (
    <Sheet open={open} onOpenChange={() => onClose()}>
      <SheetContent className="w-[420px] sm:w-[500px] overflow-y-auto">
        <SheetHeader><SheetTitle>New Reservation</SheetTitle></SheetHeader>
        <div className="space-y-4 mt-4">
          {/* Customer */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase">Customer</label>
            {!newCustomer ? (
              <>
                <Input placeholder="Search by name, phone, email..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
                {filteredCustomers.length > 0 && (
                  <div className="border rounded max-h-32 overflow-y-auto">
                    {filteredCustomers.map(c => (
                      <button key={c.id} className={cn("w-full text-left p-2 text-sm hover:bg-muted/50", selectedCustomerId === c.id && "bg-primary/10")}
                        onClick={() => { setSelectedCustomerId(c.id); setCustomerSearch(`${c.first_name} ${c.last_name}`); }}>
                        {c.first_name} {c.last_name} {c.phone && `· ${c.phone}`}
                      </button>
                    ))}
                  </div>
                )}
                <Button variant="ghost" size="sm" onClick={() => setNewCustomer(true)}>
                  <Plus className="h-3 w-3 mr-1" /> New Customer
                </Button>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)} />
                <Input placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)} />
                <Input placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} />
                <Input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
                <Button variant="ghost" size="sm" onClick={() => setNewCustomer(false)} className="col-span-2">← Search existing</Button>
              </div>
            )}
          </div>
          <Separator />
          {/* Date/Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Time</label>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>
          {/* Duration preview */}
          <div className="text-xs text-muted-foreground">
            Duration: {duration}min{selectedSitting ? ` + ${selectedSitting.buffer_minutes}min buffer` : ''} → ends {format(endAt, 'HH:mm')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Party Size</label>
              <Input type="number" min={1} value={partySize} onChange={e => setPartySize(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Source</label>
              <Select value={source} onValueChange={v => setSource(v as ReservationSource)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="walk_in">Walk-in</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Sitting */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Sitting</label>
            <Select value={sittingId || ''} onValueChange={v => setSittingId(v || null)}>
              <SelectTrigger><SelectValue placeholder="Select sitting..." /></SelectTrigger>
              <SelectContent>
                {sittings.filter(s => s.is_active).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0,5)}–{s.end_time.slice(0,5)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Location */}
          {!selectedLocationId && locations.length > 1 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Location</label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {/* Tables */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Assign Tables (optional)</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {tables.filter(t => t.is_active && (!locationId || t.location_id === locationId)).map(t => (
                <button key={t.id}
                  className={cn("px-2 py-1 rounded border text-xs transition-colors",
                    selectedTableIds.includes(t.id) ? "bg-primary/15 border-primary text-primary" : "hover:bg-muted")}
                  onClick={() => setSelectedTableIds(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id])}>
                  {t.name} ({t.seats})
                </button>
              ))}
            </div>
          </div>
          {/* Warnings */}
          {tableConflicts.length > 0 && (
            <div className="p-2 rounded bg-destructive/10 text-destructive text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Table(s) already booked at this time ({tableConflicts.length} conflict{tableConflicts.length > 1 ? 's' : ''}) — you can override
            </div>
          )}
          {capacityWarning && (
            <div className="p-2 rounded bg-warning/10 text-warning text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Party size ({partySize}) exceeds table capacity ({selectedTableSeats} seats)
            </div>
          )}
          {coverCheck.exceeds && (
            <div className="p-2 rounded bg-destructive/10 text-destructive text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Capacity exceeded: {coverCheck.total}/{selectedSitting?.max_covers} covers
            </div>
          )}
          {/* Special requests */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Special Requests</label>
            <Input value={specialRequests} onChange={e => setSpecialRequests(e.target.value)} placeholder="Allergies, birthday, highchair..." />
          </div>
          <Separator />
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={createRes.isPending || (!selectedCustomerId && !newCustomer)}>
              Create (Pending)
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
