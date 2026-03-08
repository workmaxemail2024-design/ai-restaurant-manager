import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocation } from "@/contexts/LocationContext";

// ── Types ──────────────────────────────────────────────

export type ReservationStatus = 'inquiry' | 'pending' | 'confirmed' | 'arrived' | 'declined' | 'cancelled' | 'seated' | 'completed' | 'no_show';
export type ReservationSource = 'phone' | 'walk_in' | 'online' | 'staff';
export type TableShape = 'square' | 'circle' | 'rect';

export const STATUS_LIFECYCLE: ReservationStatus[] = ['pending', 'confirmed', 'arrived', 'seated', 'completed'];

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  inquiry: 'Inquiry', pending: 'Pending', confirmed: 'Confirmed', arrived: 'Arrived',
  declined: 'Declined', cancelled: 'Cancelled', seated: 'Seated', completed: 'Completed', no_show: 'No-show',
};

export const STATUS_COLORS: Record<ReservationStatus, string> = {
  inquiry: 'bg-muted text-muted-foreground',
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  confirmed: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30',
  arrived: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30',
  declined: 'bg-destructive/15 text-destructive border-destructive/30',
  cancelled: 'bg-muted text-muted-foreground',
  seated: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  completed: 'bg-green-500/10 text-green-600 dark:text-green-500',
  no_show: 'bg-destructive/10 text-destructive',
};

export interface ReservationCustomer {
  id: string;
  restaurant_id: string;
  location_id: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  marketing_opt_in: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Reservation {
  id: string;
  restaurant_id: string;
  location_id: string;
  customer_id: string | null;
  start_at: string;
  end_at: string;
  party_size: number;
  status: ReservationStatus;
  source: ReservationSource;
  table_ids: string[];
  sitting_id: string | null;
  special_requests: string | null;
  actual_spend: number | null;
  decline_reason: string | null;
  cancellation_reason: string | null;
  arrived_at: string | null;
  seated_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  customer?: ReservationCustomer;
  sitting?: ReservationSitting;
}

export interface ReservationTable {
  id: string;
  restaurant_id: string;
  location_id: string;
  name: string;
  seats: number;
  area: string | null;
  shape: TableShape;
  x: number;
  y: number;
  w: number;
  h: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReservationSitting {
  id: string;
  restaurant_id: string;
  location_id: string | null;
  name: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  default_duration_minutes: number;
  buffer_minutes: number;
  max_covers: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Query Keys ─────────────────────────────────────────

function resKeys(restaurantId: string | undefined, locationId: string | null) {
  const loc = locationId ?? 'all';
  return {
    reservations: (from: string, to: string) => ['reservations', restaurantId, loc, from, to] as const,
    customers: ['reservation-customers', restaurantId, loc] as const,
    tables: ['reservation-tables', restaurantId, loc] as const,
    sittings: ['reservation-sittings', restaurantId, loc] as const,
    pendingCount: ['reservation-pending-count', restaurantId, loc] as const,
  };
}

// ── Reservations ───────────────────────────────────────

export function useReservations(from: string, to: string) {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const rid = currentRestaurant?.id;

  return useQuery({
    queryKey: resKeys(rid, selectedLocationId).reservations(from, to),
    enabled: !!rid,
    queryFn: async () => {
      let q = supabase
        .from('reservations')
        .select('*, customer:reservation_customers(*), sitting:reservation_sittings(*)')
        .eq('restaurant_id', rid!)
        .gte('start_at', from)
        .lte('start_at', to)
        .order('start_at');

      if (selectedLocationId) q = q.eq('location_id', selectedLocationId);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(r => ({
        ...r,
        table_ids: Array.isArray(r.table_ids) ? r.table_ids : [],
      })) as Reservation[];
    },
  });
}

export function usePendingReservationCount() {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const rid = currentRestaurant?.id;

  return useQuery({
    queryKey: resKeys(rid, selectedLocationId).pendingCount,
    enabled: !!rid,
    queryFn: async () => {
      let q = supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', rid!)
        .eq('status', 'pending');

      if (selectedLocationId) q = q.eq('location_id', selectedLocationId);

      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 30000,
  });
}

export function useCreateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<Reservation, 'id' | 'created_at' | 'updated_at' | 'customer' | 'sitting'>) => {
      const { data: res, error } = await supabase.from('reservations').insert(data as any).select().single();
      if (error) throw error;
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] });
      qc.invalidateQueries({ queryKey: ['reservation-pending-count'] });
      toast({ title: "Reservation created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Reservation> & { id: string }) => {
      const { customer, sitting, ...rest } = data as any;
      const { data: res, error } = await supabase.from('reservations').update(rest).eq('id', id).select().single();
      if (error) throw error;
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] });
      qc.invalidateQueries({ queryKey: ['reservation-pending-count'] });
      qc.invalidateQueries({ queryKey: ['reservation-customer-stats'] });
      toast({ title: "Reservation updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ── Customers ──────────────────────────────────────────

export function useReservationCustomers() {
  const { currentRestaurant } = useRestaurant();
  const rid = currentRestaurant?.id;

  return useQuery({
    queryKey: ['reservation-customers', rid],
    enabled: !!rid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reservation_customers')
        .select('*')
        .eq('restaurant_id', rid!)
        .order('last_name');
      if (error) throw error;
      return data as ReservationCustomer[];
    },
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<ReservationCustomer, 'id' | 'created_at' | 'updated_at'>) => {
      const { data: res, error } = await supabase.from('reservation_customers').insert(data).select().single();
      if (error) throw error;
      return res as ReservationCustomer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservation-customers'] });
      toast({ title: "Customer created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<ReservationCustomer> & { id: string }) => {
      const { data: res, error } = await supabase.from('reservation_customers').update(data).eq('id', id).select().single();
      if (error) throw error;
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservation-customers'] });
      toast({ title: "Customer updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ── Customer Reservation History ───────────────────────

export function useCustomerReservations(customerId: string | null | undefined) {
  const { currentRestaurant } = useRestaurant();
  const rid = currentRestaurant?.id;

  return useQuery({
    queryKey: ['customer-reservations', rid, customerId],
    enabled: !!rid && !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reservations')
        .select('id, start_at, party_size, status, actual_spend')
        .eq('restaurant_id', rid!)
        .eq('customer_id', customerId!)
        .order('start_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as Pick<Reservation, 'id' | 'start_at' | 'party_size' | 'status' | 'actual_spend'>[];
    },
  });
}

// ── Tables ─────────────────────────────────────────────

export function useReservationTables(overrideLocationId?: string | null) {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const rid = currentRestaurant?.id;
  const effectiveLocationId = overrideLocationId !== undefined ? overrideLocationId : selectedLocationId;

  return useQuery({
    queryKey: resKeys(rid, effectiveLocationId).tables,
    enabled: !!rid,
    queryFn: async () => {
      let q = supabase.from('reservation_tables').select('*').eq('restaurant_id', rid!).order('name');
      if (effectiveLocationId) q = q.eq('location_id', effectiveLocationId);
      const { data, error } = await q;
      if (error) throw error;
      return data as ReservationTable[];
    },
  });
}

export function useCreateTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<ReservationTable, 'id' | 'created_at' | 'updated_at'>) => {
      const { data: res, error } = await supabase.from('reservation_tables').insert(data as any).select().single();
      if (error) throw error;
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservation-tables'] });
      toast({ title: "Table created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<ReservationTable> & { id: string }) => {
      const { data: res, error } = await supabase.from('reservation_tables').update(data as any).eq('id', id).select().single();
      if (error) throw error;
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservation-tables'] });
      toast({ title: "Table updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reservation_tables').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservation-tables'] });
      toast({ title: "Table deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ── Sittings ───────────────────────────────────────────

export function useReservationSittings() {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const rid = currentRestaurant?.id;

  return useQuery({
    queryKey: resKeys(rid, selectedLocationId).sittings,
    enabled: !!rid,
    queryFn: async () => {
      let q = supabase.from('reservation_sittings').select('*').eq('restaurant_id', rid!).order('start_time');
      if (selectedLocationId) q = q.eq('location_id', selectedLocationId);
      const { data, error } = await q;
      if (error) throw error;
      return data as ReservationSitting[];
    },
  });
}

export function useCreateSitting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<ReservationSitting, 'id' | 'created_at' | 'updated_at'>) => {
      const { data: res, error } = await supabase.from('reservation_sittings').insert(data as any).select().single();
      if (error) throw error;
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservation-sittings'] });
      toast({ title: "Sitting created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateSitting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<ReservationSitting> & { id: string }) => {
      const { data: res, error } = await supabase.from('reservation_sittings').update(data as any).eq('id', id).select().single();
      if (error) throw error;
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservation-sittings'] });
      toast({ title: "Sitting updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteSitting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reservation_sittings').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservation-sittings'] });
      toast({ title: "Sitting deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ── Conflict detection ─────────────────────────────────

export function checkTableConflicts(
  reservations: Reservation[],
  tableIds: string[],
  startAt: string,
  endAt: string,
  excludeId?: string,
): Reservation[] {
  if (!tableIds.length) return [];
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();

  return reservations.filter(r => {
    if (excludeId && r.id === excludeId) return false;
    if (['cancelled', 'declined', 'no_show', 'completed'].includes(r.status)) return false;
    const rStart = new Date(r.start_at).getTime();
    const rEnd = new Date(r.end_at).getTime();
    const overlaps = start < rEnd && end > rStart;
    if (!overlaps) return false;
    const rTableIds = Array.isArray(r.table_ids) ? r.table_ids : [];
    return tableIds.some(t => rTableIds.includes(t));
  });
}

export function checkCoverConflicts(
  reservations: Reservation[],
  sittingId: string | null,
  startAt: string,
  endAt: string,
  partySize: number,
  maxCovers: number | null,
  excludeId?: string,
): { total: number; exceeds: boolean } {
  if (!maxCovers || !sittingId) return { total: 0, exceeds: false };
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();

  const existingCovers = reservations
    .filter(r => {
      if (excludeId && r.id === excludeId) return false;
      if (['cancelled', 'declined', 'no_show', 'completed'].includes(r.status)) return false;
      if (r.sitting_id !== sittingId) return false;
      const rStart = new Date(r.start_at).getTime();
      const rEnd = new Date(r.end_at).getTime();
      return start < rEnd && end > rStart;
    })
    .reduce((sum, r) => sum + r.party_size, 0);

  const total = existingCovers + partySize;
  return { total, exceeds: total > maxCovers };
}

// ── Status transition helpers ──────────────────────────

export function getNextActions(status: ReservationStatus): { label: string; status: ReservationStatus; variant?: string }[] {
  switch (status) {
    case 'pending':
      return [
        { label: 'Confirm', status: 'confirmed' },
        { label: 'Cancel', status: 'cancelled', variant: 'outline' },
        { label: 'No-show', status: 'no_show', variant: 'destructive' },
      ];
    case 'confirmed':
      return [
        { label: 'Mark Arrived', status: 'arrived' },
        { label: 'Seat Guests', status: 'seated', variant: 'outline' },
        { label: 'Cancel', status: 'cancelled', variant: 'outline' },
        { label: 'No-show', status: 'no_show', variant: 'destructive' },
      ];
    case 'arrived':
      return [
        { label: 'Seat Guests', status: 'seated' },
        { label: 'No-show', status: 'no_show', variant: 'destructive' },
      ];
    case 'seated':
      return [
        { label: 'Complete', status: 'completed' },
      ];
    default:
      return [];
  }
}

export function getTimestampPayload(newStatus: ReservationStatus): Record<string, string> {
  const now = new Date().toISOString();
  switch (newStatus) {
    case 'arrived': return { arrived_at: now };
    case 'seated': return { seated_at: now };
    case 'completed': return { completed_at: now };
    default: return {};
  }
}
