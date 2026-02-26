import { useState, useMemo } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Search, Plus, User, Phone, Mail, Star, AlertTriangle } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { useRestaurant } from "@/contexts/RestaurantContext";
import {
  useReservationCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  type ReservationCustomer,
} from "@/hooks/useReservations";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

// Customer stats from reservations
function useCustomerStats(restaurantId: string | undefined) {
  return useQuery({
    queryKey: ['reservation-customer-stats', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reservations')
        .select('customer_id, status, actual_spend, start_at')
        .eq('restaurant_id', restaurantId!);
      if (error) throw error;

      const stats: Record<string, { visits: number; totalSpend: number; noShows: number; lastVisit: string | null }> = {};
      (data || []).forEach(r => {
        if (!r.customer_id) return;
        if (!stats[r.customer_id]) stats[r.customer_id] = { visits: 0, totalSpend: 0, noShows: 0, lastVisit: null };
        const s = stats[r.customer_id];
        if (['completed', 'seated'].includes(r.status)) {
          s.visits++;
          s.totalSpend += r.actual_spend || 0;
          if (!s.lastVisit || r.start_at > s.lastVisit) s.lastVisit = r.start_at;
        }
        if (r.status === 'no_show') s.noShows++;
      });
      return stats;
    },
  });
}

export default function ReservationCustomersPage() {
  const { currentRestaurant } = useRestaurant();
  const rid = currentRestaurant?.id;
  const { data: customers = [] } = useReservationCustomers();
  const { data: stats = {} } = useCustomerStats(rid);
  const createCust = useCreateCustomer();
  const updateCust = useUpdateCustomer();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ReservationCustomer | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const enriched = useMemo(() => {
    return customers.map(c => {
      const s = stats[c.id] || { visits: 0, totalSpend: 0, noShows: 0, lastVisit: null };
      const daysSince = s.lastVisit ? differenceInDays(new Date(), parseISO(s.lastVisit)) : null;
      const isVIP = s.totalSpend > 500 || s.visits >= 10;
      const isAtRisk = daysSince !== null && daysSince > 60;
      return { ...c, ...s, daysSince, isVIP, isAtRisk, avgSpend: s.visits > 0 ? s.totalSpend / s.visits : 0 };
    });
  }, [customers, stats]);

  const filtered = search.length >= 2
    ? enriched.filter(c => `${c.first_name} ${c.last_name} ${c.phone || ''} ${c.email || ''}`.toLowerCase().includes(search.toLowerCase()))
    : enriched;

  return (
    <PageLayout
      title="Customers"
      subtitle="Track guests, visits, and spend history"
      action={
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" /> New Customer</Button>
      }
    >
      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search customers..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Phone</th>
                  <th className="text-left p-3 font-medium">Email</th>
                  <th className="text-right p-3 font-medium">Visits</th>
                  <th className="text-right p-3 font-medium">Total Spend</th>
                  <th className="text-right p-3 font-medium">Avg Spend</th>
                  <th className="text-right p-3 font-medium">No-shows</th>
                  <th className="text-left p-3 font-medium">Last Visit</th>
                  <th className="text-left p-3 font-medium">Tags</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No customers found</td></tr>
                )}
                {filtered.map(c => (
                  <tr key={c.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => setSelected(c)}>
                    <td className="p-3 font-medium">{c.first_name} {c.last_name}</td>
                    <td className="p-3 text-muted-foreground">{c.phone || '—'}</td>
                    <td className="p-3 text-muted-foreground">{c.email || '—'}</td>
                    <td className="p-3 text-right">{c.visits}</td>
                    <td className="p-3 text-right">€{c.totalSpend.toFixed(2)}</td>
                    <td className="p-3 text-right">€{c.avgSpend.toFixed(2)}</td>
                    <td className="p-3 text-right">{c.noShows}</td>
                    <td className="p-3 text-muted-foreground">{c.lastVisit ? format(parseISO(c.lastVisit), 'd MMM yyyy') : '—'}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        {c.isVIP && <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">VIP</Badge>}
                        {c.isAtRisk && <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">At-risk</Badge>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Customer Drawer */}
      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent className="w-[400px] sm:w-[480px] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {selected.first_name} {selected.last_name}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Phone</p><p>{selected.phone || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Email</p><p>{selected.email || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Marketing</p><p>{selected.marketing_opt_in ? 'Opted in' : 'No'}</p></div>
                </div>
                {selected.notes && (
                  <div><p className="text-xs text-muted-foreground font-medium">Notes</p><p className="text-sm">{selected.notes}</p></div>
                )}
                <Separator />
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div><p className="text-2xl font-bold">{(stats[selected.id]?.visits) || 0}</p><p className="text-xs text-muted-foreground">Visits</p></div>
                  <div><p className="text-2xl font-bold">€{(stats[selected.id]?.totalSpend || 0).toFixed(0)}</p><p className="text-xs text-muted-foreground">Total Spend</p></div>
                  <div><p className="text-2xl font-bold">{stats[selected.id]?.noShows || 0}</p><p className="text-xs text-muted-foreground">No-shows</p></div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Create Customer Dialog */}
      <CreateCustomerDialog open={showCreate} onClose={() => setShowCreate(false)} restaurantId={rid} />
    </PageLayout>
  );
}

function CreateCustomerDialog({ open, onClose, restaurantId }: { open: boolean; onClose: () => void; restaurantId: string | undefined }) {
  const createCust = useCreateCustomer();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [marketing, setMarketing] = useState(false);

  const handleSave = async () => {
    if (!restaurantId || !firstName || !lastName) return;
    await createCust.mutateAsync({
      restaurant_id: restaurantId, location_id: null,
      first_name: firstName, last_name: lastName,
      phone: phone || null, email: email || null,
      marketing_opt_in: marketing, notes: notes || null,
    });
    onClose();
    setFirstName(''); setLastName(''); setPhone(''); setEmail(''); setNotes(''); setMarketing(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Customer</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium">First Name</label><Input value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
            <div><label className="text-xs font-medium">Last Name</label><Input value={lastName} onChange={e => setLastName(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium">Phone</label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
            <div><label className="text-xs font-medium">Email</label><Input value={email} onChange={e => setEmail(e.target.value)} /></div>
          </div>
          <div><label className="text-xs font-medium">Notes</label><Input value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <div className="flex items-center gap-2">
            <Checkbox checked={marketing} onCheckedChange={v => setMarketing(!!v)} />
            <label className="text-sm">Marketing opt-in</label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={!firstName || !lastName || createCust.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
