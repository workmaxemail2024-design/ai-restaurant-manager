import { useState, useRef, useCallback } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, GripVertical, Eye, Edit3 } from "lucide-react";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocation } from "@/contexts/LocationContext";
import { useLocations } from "@/hooks/useLocations";
import { useReservationTables, useCreateTable, useUpdateTable, useDeleteTable, type ReservationTable, type TableShape } from "@/hooks/useReservations";
import { cn } from "@/lib/utils";
import { LocationSelector } from "@/components/LocationSelector";

export default function ReservationFloorPage() {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const { data: locations = [] } = useLocations();
  const { data: tables = [] } = useReservationTables();
  const createTable = useCreateTable();
  const updateTable = useUpdateTable();
  const deleteTable = useDeleteTable();
  const rid = currentRestaurant?.id;

  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [showAdd, setShowAdd] = useState(false);
  const [editTable, setEditTable] = useState<ReservationTable | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Add table form
  const [formName, setFormName] = useState("");
  const [formSeats, setFormSeats] = useState(4);
  const [formShape, setFormShape] = useState<TableShape>('rect');
  const [formArea, setFormArea] = useState("");
  const [formLocationId, setFormLocationId] = useState(selectedLocationId || (locations.length > 0 ? locations[0].id : ''));

  const activeTables = tables.filter(t => t.is_active);

  const handleAddTable = async () => {
    if (!rid || !formLocationId || !formName) return;
    await createTable.mutateAsync({
      restaurant_id: rid,
      location_id: formLocationId,
      name: formName,
      seats: formSeats,
      shape: formShape,
      area: formArea || null,
      x: 50 + Math.random() * 400,
      y: 50 + Math.random() * 200,
      w: formShape === 'circle' ? 70 : 80,
      h: formShape === 'circle' ? 70 : 60,
      is_active: true,
    });
    setShowAdd(false);
    setFormName(""); setFormSeats(4); setFormShape('rect'); setFormArea("");
  };

  const handleDrag = useCallback((e: React.MouseEvent, tableId: string) => {
    if (mode !== 'edit') return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const table = tables.find(t => t.id === tableId);
    if (!table) return;
    const origX = Number(table.x);
    const origY = Number(table.y);

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const newX = Math.max(0, origX + dx);
      const newY = Math.max(0, origY + dy);
      // optimistic visual update via style
      const el = document.getElementById(`table-${tableId}`);
      if (el) { el.style.left = `${newX}px`; el.style.top = `${newY}px`; }
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        updateTable.mutate({ id: tableId, x: Math.max(0, origX + dx), y: Math.max(0, origY + dy) });
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [mode, tables, updateTable]);

  return (
    <PageLayout
      title="Floor Plan"
      subtitle="Drag tables to arrange your floor layout"
      action={
        <div className="flex items-center gap-2">
          <LocationSelector />
          <Button variant={mode === 'edit' ? 'default' : 'outline'} size="sm" onClick={() => setMode('edit')}><Edit3 className="h-3.5 w-3.5 mr-1" /> Edit</Button>
          <Button variant={mode === 'preview' ? 'default' : 'outline'} size="sm" onClick={() => setMode('preview')}><Eye className="h-3.5 w-3.5 mr-1" /> Preview</Button>
          <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" /> Add Table</Button>
        </div>
      }
    >
      <Card>
        <CardContent className="p-0">
          <div ref={canvasRef} className="relative bg-muted/30 border rounded-lg overflow-hidden" style={{ height: 500, minWidth: 600 }}>
            {activeTables.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                No tables yet. Click "Add Table" to get started.
              </div>
            )}
            {activeTables.map(t => (
              <div
                key={t.id}
                id={`table-${t.id}`}
                className={cn(
                  "absolute flex flex-col items-center justify-center border-2 text-xs font-medium select-none transition-shadow",
                  t.shape === 'circle' ? 'rounded-full' : t.shape === 'square' ? 'rounded-md' : 'rounded-lg',
                  mode === 'edit' ? 'cursor-grab active:cursor-grabbing hover:shadow-md border-primary/40 bg-card' : 'border-border bg-card/80',
                )}
                style={{ left: Number(t.x), top: Number(t.y), width: Number(t.w), height: Number(t.h) }}
                onMouseDown={e => handleDrag(e, t.id)}
                onDoubleClick={() => mode === 'edit' && setEditTable(t)}
              >
                <span className="font-semibold">{t.name}</span>
                <span className="text-muted-foreground text-[10px]">{t.seats} seats</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add Table Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Table</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Name</label>
              <Input placeholder="T1, Bar 1, etc." value={formName} onChange={e => setFormName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Seats</label>
                <Input type="number" min={1} value={formSeats} onChange={e => setFormSeats(Number(e.target.value))} />
              </div>
              <div>
                <label className="text-xs font-medium">Shape</label>
                <Select value={formShape} onValueChange={v => setFormShape(v as TableShape)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rect">Rectangle</SelectItem>
                    <SelectItem value="square">Square</SelectItem>
                    <SelectItem value="circle">Circle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Area (optional)</label>
              <Input placeholder="Main, Terrace, Bar..." value={formArea} onChange={e => setFormArea(e.target.value)} />
            </div>
            {!selectedLocationId && locations.length > 1 && (
              <div>
                <label className="text-xs font-medium">Location</label>
                <Select value={formLocationId} onValueChange={setFormLocationId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleAddTable} disabled={!formName || createTable.isPending}>Add Table</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Table Dialog */}
      {editTable && (
        <Dialog open={!!editTable} onOpenChange={() => setEditTable(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Table: {editTable.name}</DialogTitle></DialogHeader>
            <EditTableForm table={editTable} onSave={(data) => { updateTable.mutate({ id: editTable.id, ...data }); setEditTable(null); }}
              onDelete={() => { deleteTable.mutate(editTable.id); setEditTable(null); }} />
          </DialogContent>
        </Dialog>
      )}
    </PageLayout>
  );
}

function EditTableForm({ table, onSave, onDelete }: { table: ReservationTable; onSave: (d: Partial<ReservationTable>) => void; onDelete: () => void }) {
  const [name, setName] = useState(table.name);
  const [seats, setSeats] = useState(table.seats);
  const [area, setArea] = useState(table.area || '');
  const [shape, setShape] = useState(table.shape);

  return (
    <div className="space-y-3">
      <div><label className="text-xs font-medium">Name</label><Input value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs font-medium">Seats</label><Input type="number" min={1} value={seats} onChange={e => setSeats(Number(e.target.value))} /></div>
        <div>
          <label className="text-xs font-medium">Shape</label>
          <Select value={shape} onValueChange={v => setShape(v as TableShape)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rect">Rectangle</SelectItem>
              <SelectItem value="square">Square</SelectItem>
              <SelectItem value="circle">Circle</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div><label className="text-xs font-medium">Area</label><Input value={area} onChange={e => setArea(e.target.value)} /></div>
      <DialogFooter className="flex justify-between">
        <Button variant="destructive" size="sm" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 mr-1" /> Delete</Button>
        <Button onClick={() => onSave({ name, seats, area: area || null, shape })}>Save</Button>
      </DialogFooter>
    </div>
  );
}
