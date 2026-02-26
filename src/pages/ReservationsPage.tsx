import { useState, useMemo } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Clock, Users, Plus, Search, TrendingUp, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { format, parseISO, addMinutes, eachHourOfInterval } from "date-fns";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocation } from "@/contexts/LocationContext";
import { useLocations } from "@/hooks/useLocations";
import {
  useReservations,
  useReservationTables,
  useReservationSittings,
  useReservationCustomers,
  useCreateReservation,
  useUpdateReservation,
  useCreateCustomer,
  checkTableConflicts,
  checkCoverConflicts,
  type Reservation,
  type ReservationStatus,
  type ReservationSource,
  type ReservationCustomer,
} from "@/hooks/useReservations";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { LocationSelector } from "@/components/LocationSelector";
import { DateRangeSelector } from "@/components/DateRangeSelector";

const STATUS_COLORS: Record<ReservationStatus, string> = {
  inquiry: 'bg-muted text-muted-foreground',
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  confirmed: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30',
  declined: 'bg-destructive/15 text-destructive border-destructive/30',
  cancelled: 'bg-muted text-muted-foreground',
  seated: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  completed: 'bg-green-500/10 text-green-600 dark:text-green-500',
  no_show: 'bg-destructive/10 text-destructive',
};

const STATUS_LABELS: Record<ReservationStatus, string> = {
  inquiry: 'Inquiry', pending: 'Pending', confirmed: 'Confirmed', declined: 'Declined',
  cancelled: 'Cancelled', seated: 'Seated', completed: 'Completed', no_show: 'No-show',
};

export default function ReservationsPage() {
  const { startDate, endDate } = useDateRange();
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const rid = currentRestaurant?.id;

  const from = `${startDate}T00:00:00`;
  const to = `${endDate}T23:59:59.999`;
  const startDateObj = parseISO(startDate);

  const { data: reservations = [], isLoading } = useReservations(from, to);
  const { data: tables = [] } = useReservationTables();
  const { data: sittings = [] } = useReservationSittings();
  const { data: customers = [] } = useReservationCustomers();
  const { data: locations = [] } = useLocations();

  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // ── KPIs ──
  const kpis = useMemo(() => {
    const active = reservations.filter(r => !['cancelled', 'declined'].includes(r.status));
    const confirmed = reservations.filter(r => r.status === 'confirmed' || r.status === 'seated' || r.status === 'completed');
    const pending = reservations.filter(r => r.status === 'pending');
    const completed = reservations.filter(r => r.status === 'completed');
    const noShows = reservations.filter(r => r.status === 'no_show');
    const totalCovers = active.reduce((s, r) => s + r.party_size, 0);
    const confirmedCovers = confirmed.reduce((s, r) => s + r.party_size, 0);
    const pendingCovers = pending.reduce((s, r) => s + r.party_size, 0);
    const totalSeats = tables.filter(t => t.is_active).reduce((s, t) => s + t.seats, 0);
    const utilisation = totalSeats > 0 ? Math.round((confirmedCovers / totalSeats) * 100) : 0;
    const avgParty = active.length > 0 ? (totalCovers / active.length).toFixed(1) : '0';
    const spendData = completed.filter(r => r.actual_spend != null);
    const avgSpend = spendData.length > 0 ? (spendData.reduce((s, r) => s + (r.actual_spend || 0), 0) / spendData.length).toFixed(2) : '—';
    const noShowRate = (active.length + noShows.length) > 0 ? Math.round((noShows.length / (active.length + noShows.length)) * 100) : 0;
    return { totalCovers, confirmedCovers, pendingCovers, utilisation, avgParty, avgSpend, noShowRate };
  }, [reservations, tables]);

  // ── Filtered list ──
  const filteredReservations = useMemo(() => {
    let list = reservations;
    if (statusFilter !== 'all') list = list.filter(r => r.status === statusFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r => {
        const name = r.customer ? `${r.customer.first_name} ${r.customer.last_name}`.toLowerCase() : '';
        return name.includes(q) || r.special_requests?.toLowerCase().includes(q);
      });
    }
    return list;
  }, [reservations, statusFilter, searchQuery]);

  return (
    <PageLayout
      title="Reservations"
      subtitle="Manage bookings, covers, and table assignments"
      action={
        <div className="flex items-center gap-2">
          <LocationSelector />
          <DateRangeSelector />
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Booking
          </Button>
        </div>
      }
    >
      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
        <KPICard label="Total Covers" value={kpis.totalCovers} icon={Users} />
        <KPICard label="Confirmed" value={kpis.confirmedCovers} icon={CheckCircle2} className="text-green-600" />
        <KPICard label="Pending" value={kpis.pendingCovers} icon={Clock} className="text-amber-600" />
        <KPICard label="Utilisation" value={`${kpis.utilisation}%`} icon={TrendingUp} />
        <KPICard label="Avg Party" value={kpis.avgParty} icon={Users} />
        <KPICard label="Avg Spend" value={kpis.avgSpend === '—' ? '—' : `€${kpis.avgSpend}`} icon={TrendingUp} />
        <KPICard label="No-show %" value={`${kpis.noShowRate}%`} icon={XCircle} className={kpis.noShowRate > 10 ? 'text-destructive' : ''} />
      </div>

      <Tabs defaultValue="timeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="list">List View</TabsTrigger>
        </TabsList>

        {/* ── Timeline View ── */}
        <TabsContent value="timeline">
          <TimelineView
            reservations={reservations}
            tables={tables}
            startDate={startDateObj}
            onSelect={setSelectedRes}
          />
        </TabsContent>

        {/* ── List View ── */}
        <TabsContent value="list">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search customer..." className="pl-8" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left p-3 font-medium">Time</th>
                      <th className="text-left p-3 font-medium">Customer</th>
                      <th className="text-left p-3 font-medium">Party</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium">Sitting</th>
                      <th className="text-left p-3 font-medium">Tables</th>
                      <th className="text-left p-3 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReservations.length === 0 && (
                      <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No reservations found</td></tr>
                    )}
                    {filteredReservations.map(r => (
                      <tr key={r.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => setSelectedRes(r)}>
                        <td className="p-3 whitespace-nowrap">{format(parseISO(r.start_at), 'HH:mm')} – {format(parseISO(r.end_at), 'HH:mm')}</td>
                        <td className="p-3">{r.customer ? `${r.customer.first_name} ${r.customer.last_name}` : <span className="text-muted-foreground italic">Walk-in</span>}</td>
                        <td className="p-3">{r.party_size}</td>
                        <td className="p-3"><Badge variant="outline" className={cn('text-xs', STATUS_COLORS[r.status])}>{STATUS_LABELS[r.status]}</Badge></td>
                        <td className="p-3 text-muted-foreground">{r.sitting?.name || '—'}</td>
                        <td className="p-3 text-muted-foreground">{(r.table_ids || []).map(tid => tables.find(t => t.id === tid)?.name).filter(Boolean).join(', ') || '—'}</td>
                        <td className="p-3">{r.special_requests ? <span className="text-xs text-muted-foreground truncate max-w-[120px] block">{r.special_requests}</span> : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Detail Drawer ── */}
      <ReservationDrawer
        reservation={selectedRes}
        onClose={() => setSelectedRes(null)}
        reservations={reservations}
        tables={tables}
        sittings={sittings}
      />

      {/* ── Create Modal ── */}
      <CreateReservationSheet
        open={showCreate}
        onClose={() => setShowCreate(false)}
        customers={customers}
        tables={tables}
        sittings={sittings}
        reservations={reservations}
        locations={locations}
      />
    </PageLayout>
  );
}

// ── KPI Card ──

function KPICard({ label, value, icon: Icon, className }: { label: string; value: string | number; icon: any; className?: string }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <Icon className={cn("h-4 w-4 text-muted-foreground shrink-0", className)} />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className={cn("text-lg font-semibold", className)}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Timeline View ──

function TimelineView({ reservations, tables, startDate, onSelect }: {
  reservations: Reservation[];
  tables: any[];
  startDate: Date;
  onSelect: (r: Reservation) => void;
}) {
  const activeTables = tables.filter(t => t.is_active);
  const hours = eachHourOfInterval({ start: new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 9), end: new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 23) });

  if (activeTables.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <p>No tables configured. Add tables in the Floor Plan page first.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Header row */}
          <div className="flex border-b sticky top-0 bg-card z-10">
            <div className="w-24 shrink-0 p-2 text-xs font-medium text-muted-foreground border-r">Table</div>
            {hours.map(h => (
              <div key={h.toISOString()} className="flex-1 min-w-[60px] p-2 text-xs text-center text-muted-foreground border-r last:border-r-0">
                {format(h, 'HH:mm')}
              </div>
            ))}
          </div>
          {/* Table rows */}
          {activeTables.map(table => {
            const tableRes = reservations.filter(r =>
              Array.isArray(r.table_ids) && r.table_ids.includes(table.id) &&
              !['cancelled', 'declined'].includes(r.status)
            );
            return (
              <div key={table.id} className="flex border-b last:border-b-0 relative" style={{ height: 48 }}>
                <div className="w-24 shrink-0 p-2 text-xs font-medium border-r flex items-center gap-1">
                  {table.name} <span className="text-muted-foreground">({table.seats})</span>
                </div>
                <div className="flex-1 relative">
                  {hours.map(h => (
                    <div key={h.toISOString()} className="absolute top-0 bottom-0 border-r" style={{ left: `${((h.getHours() - 9) / 14) * 100}%`, width: 0 }} />
                  ))}
                  {tableRes.map(r => {
                    const rStart = parseISO(r.start_at);
                    const rEnd = parseISO(r.end_at);
                    const startH = rStart.getHours() + rStart.getMinutes() / 60;
                    const endH = rEnd.getHours() + rEnd.getMinutes() / 60;
                    const left = Math.max(0, ((startH - 9) / 14) * 100);
                    const width = Math.min(100 - left, ((endH - startH) / 14) * 100);
                    const bgColor = r.status === 'pending' ? 'bg-amber-500/20 border-amber-500/40' :
                      r.status === 'confirmed' ? 'bg-green-500/20 border-green-500/40' :
                      r.status === 'seated' ? 'bg-blue-500/20 border-blue-500/40' :
                      'bg-muted border-muted-foreground/20';
                    return (
                      <button
                        key={r.id}
                        className={cn("absolute top-1 bottom-1 rounded border text-xs px-1 truncate cursor-pointer hover:opacity-80 transition-opacity", bgColor)}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        onClick={() => onSelect(r)}
                        title={r.customer ? `${r.customer.first_name} ${r.customer.last_name} (${r.party_size})` : `Party of ${r.party_size}`}
                      >
                        {r.customer ? `${r.customer.first_name} ${r.customer.last_name.charAt(0)}.` : `P${r.party_size}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Reservation Detail Drawer ──

function ReservationDrawer({ reservation, onClose, reservations, tables, sittings }: {
  reservation: Reservation | null;
  onClose: () => void;
  reservations: Reservation[];
  tables: any[];
  sittings: any[];
}) {
  const updateRes = useUpdateReservation();
  if (!reservation) return null;

  const r = reservation;
  const handleStatus = (status: ReservationStatus, decline_reason?: string) => {
    if (status === 'confirmed' && r.table_ids.length > 0) {
      const conflicts = checkTableConflicts(reservations, r.table_ids, r.start_at, r.end_at, r.id);
      if (conflicts.length > 0) {
        toast({ title: "Conflict detected", description: `Table(s) already booked at this time by ${conflicts.length} reservation(s).`, variant: "destructive" });
        return;
      }
    }
    updateRes.mutate({ id: r.id, status, ...(decline_reason ? { decline_reason } : {}) });
  };

  return (
    <Sheet open={!!reservation} onOpenChange={() => onClose()}>
      <SheetContent className="w-[400px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Reservation
            <Badge variant="outline" className={cn('text-xs ml-2', STATUS_COLORS[r.status])}>{STATUS_LABELS[r.status]}</Badge>
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          {/* Customer info */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase">Customer</p>
            {r.customer ? (
              <div>
                <p className="font-medium">{r.customer.first_name} {r.customer.last_name}</p>
                {r.customer.phone && <p className="text-sm text-muted-foreground">{r.customer.phone}</p>}
                {r.customer.email && <p className="text-sm text-muted-foreground">{r.customer.email}</p>}
              </div>
            ) : <p className="text-sm text-muted-foreground italic">Walk-in / No customer</p>}
          </div>
          <Separator />
          {/* Booking details */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Date</p>
              <p className="font-medium">{format(parseISO(r.start_at), 'EEE, d MMM yyyy')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Time</p>
              <p className="font-medium">{format(parseISO(r.start_at), 'HH:mm')} – {format(parseISO(r.end_at), 'HH:mm')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Party Size</p>
              <p className="font-medium">{r.party_size}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Source</p>
              <p className="font-medium capitalize">{r.source.replace('_', ' ')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sitting</p>
              <p className="font-medium">{r.sitting?.name || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tables</p>
              <p className="font-medium">{r.table_ids.map(tid => tables.find(t => t.id === tid)?.name).filter(Boolean).join(', ') || '—'}</p>
            </div>
          </div>
          {r.special_requests && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">Special Requests</p>
                <p className="text-sm mt-1">{r.special_requests}</p>
              </div>
            </>
          )}
          {r.decline_reason && (
            <div className="p-2 rounded bg-destructive/10 text-destructive text-sm">
              <strong>Decline reason:</strong> {r.decline_reason}
            </div>
          )}
          <Separator />
          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {r.status === 'pending' && (
              <>
                <Button size="sm" onClick={() => handleStatus('confirmed')}>Confirm</Button>
                <Button size="sm" variant="outline" onClick={() => {
                  const reason = prompt("Reason for declining:");
                  if (reason) handleStatus('declined', reason);
                }}>Decline</Button>
              </>
            )}
            {r.status === 'confirmed' && (
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => handleStatus('seated')}>Mark Seated</Button>
            )}
            {r.status === 'seated' && (
              <Button size="sm" onClick={() => handleStatus('completed')}>Complete</Button>
            )}
            {['pending', 'confirmed'].includes(r.status) && (
              <Button size="sm" variant="outline" onClick={() => handleStatus('cancelled')}>Cancel</Button>
            )}
            {['confirmed', 'pending'].includes(r.status) && (
              <Button size="sm" variant="destructive" onClick={() => handleStatus('no_show')}>No-show</Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Create Reservation Sheet ──

function CreateReservationSheet({ open, onClose, customers, tables, sittings, reservations, locations }: {
  open: boolean;
  onClose: () => void;
  customers: ReservationCustomer[];
  tables: any[];
  sittings: any[];
  reservations: Reservation[];
  locations: any[];
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
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
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

  const handleSubmit = async () => {
    if (!rid || !locationId) return;
    if (tableConflicts.length > 0) {
      toast({ title: "Table conflict", description: "Selected table(s) are already booked at this time.", variant: "destructive" });
      return;
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
      created_by: null,
    });
    onClose();
    // reset
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
          {/* Location (if no global filter) */}
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
              Table(s) already booked at this time ({tableConflicts.length} conflict{tableConflicts.length > 1 ? 's' : ''})
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
