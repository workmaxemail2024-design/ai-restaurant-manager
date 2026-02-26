import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Clock, Settings } from "lucide-react";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocation } from "@/contexts/LocationContext";
import { useLocations } from "@/hooks/useLocations";
import {
  useReservationSittings,
  useCreateSitting,
  useUpdateSitting,
  useDeleteSitting,
  type ReservationSitting,
} from "@/hooks/useReservations";
import { LocationSelector } from "@/components/LocationSelector";

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ReservationSettingsPage() {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const { data: locations = [] } = useLocations();
  const { data: sittings = [] } = useReservationSittings();
  const createSitting = useCreateSitting();
  const updateSitting = useUpdateSitting();
  const deleteSitting = useDeleteSitting();
  const rid = currentRestaurant?.id;

  const [showCreate, setShowCreate] = useState(false);
  const [editSitting, setEditSitting] = useState<ReservationSitting | null>(null);

  return (
    <PageLayout
      title="Reservation Settings"
      subtitle="Configure sittings, durations, and capacity rules"
      action={
        <div className="flex items-center gap-2">
          <LocationSelector />
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" /> Add Sitting</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Sittings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Sittings</CardTitle>
            <CardDescription>Define time slots like Lunch, Dinner, Brunch</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sittings.length === 0 && <p className="text-sm text-muted-foreground">No sittings configured yet.</p>}
            {sittings.map(s => (
              <div key={s.id} className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{s.name}</p>
                    {!s.is_active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)} · {s.default_duration_minutes}min + {s.buffer_minutes}min buffer
                    {s.max_covers ? ` · Max ${s.max_covers} covers` : ''}
                  </p>
                  <div className="flex gap-1 mt-1">
                    {(s.days_of_week || []).map(d => (
                      <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{DAY_LABELS[d]}</span>
                    ))}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditSitting(s)}>Edit</Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteSitting.mutate(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* General Settings (static for now) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Settings className="h-4 w-4" /> General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-confirm reservations</p>
                <p className="text-xs text-muted-foreground">When off, all new reservations start as Pending</p>
              </div>
              <Switch checked={false} disabled />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Capacity mode</p>
                <p className="text-xs text-muted-foreground">How capacity limits are enforced</p>
              </div>
              <Badge variant="outline">Table-based</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Sitting Dialog */}
      <SittingDialog
        open={showCreate || !!editSitting}
        sitting={editSitting}
        onClose={() => { setShowCreate(false); setEditSitting(null); }}
        restaurantId={rid}
        locationId={selectedLocationId}
        locations={locations}
        onSave={async (data) => {
          if (editSitting) {
            await updateSitting.mutateAsync({ id: editSitting.id, ...data });
          } else {
            await createSitting.mutateAsync(data as any);
          }
          setShowCreate(false); setEditSitting(null);
        }}
      />
    </PageLayout>
  );
}

function SittingDialog({ open, sitting, onClose, restaurantId, locationId, locations, onSave }: {
  open: boolean;
  sitting: ReservationSitting | null;
  onClose: () => void;
  restaurantId: string | undefined;
  locationId: string | null;
  locations: any[];
  onSave: (data: any) => Promise<void>;
}) {
  const [name, setName] = useState(sitting?.name || "");
  const [startTime, setStartTime] = useState(sitting?.start_time?.slice(0, 5) || "12:00");
  const [endTime, setEndTime] = useState(sitting?.end_time?.slice(0, 5) || "15:00");
  const [duration, setDuration] = useState(sitting?.default_duration_minutes || 90);
  const [buffer, setBuffer] = useState(sitting?.buffer_minutes || 15);
  const [maxCovers, setMaxCovers] = useState<string>(sitting?.max_covers?.toString() || "");
  const [days, setDays] = useState<number[]>(sitting?.days_of_week || [0, 1, 2, 3, 4, 5, 6]);
  const [isActive, setIsActive] = useState(sitting?.is_active ?? true);
  const [locId, setLocId] = useState(sitting?.location_id || locationId || (locations.length > 0 ? locations[0].id : ''));

  // Reset form when sitting changes
  useState(() => {
    if (sitting) {
      setName(sitting.name); setStartTime(sitting.start_time.slice(0, 5)); setEndTime(sitting.end_time.slice(0, 5));
      setDuration(sitting.default_duration_minutes); setBuffer(sitting.buffer_minutes);
      setMaxCovers(sitting.max_covers?.toString() || ""); setDays(sitting.days_of_week);
      setIsActive(sitting.is_active); setLocId(sitting.location_id || locationId || '');
    }
  });

  const handleSave = () => {
    if (!restaurantId || !name) return;
    onSave({
      restaurant_id: restaurantId,
      location_id: locId || null,
      name,
      start_time: startTime + ':00',
      end_time: endTime + ':00',
      default_duration_minutes: duration,
      buffer_minutes: buffer,
      max_covers: maxCovers ? Number(maxCovers) : null,
      days_of_week: days,
      is_active: isActive,
    });
  };

  const toggleDay = (d: number) => setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{sitting ? 'Edit Sitting' : 'New Sitting'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-xs font-medium">Name</label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Lunch, Dinner, Brunch..." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium">Start</label><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
            <div><label className="text-xs font-medium">End</label><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium">Duration (min)</label><Input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} /></div>
            <div><label className="text-xs font-medium">Buffer (min)</label><Input type="number" value={buffer} onChange={e => setBuffer(Number(e.target.value))} /></div>
          </div>
          <div><label className="text-xs font-medium">Max Covers (optional)</label><Input value={maxCovers} onChange={e => setMaxCovers(e.target.value)} placeholder="Leave empty for no limit" /></div>
          <div>
            <label className="text-xs font-medium">Days</label>
            <div className="flex gap-1.5 mt-1">
              {DAY_LABELS.map((label, i) => (
                <button key={i} className={`px-2 py-1 rounded text-xs border transition-colors ${days.includes(i) ? 'bg-primary/15 border-primary text-primary' : 'hover:bg-muted'}`}
                  onClick={() => toggleDay(i)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <label className="text-sm">Active</label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={!name}>{sitting ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
