import { useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Eye, Edit3, MapPin, Loader2 } from "lucide-react";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocation } from "@/contexts/LocationContext";
import { useLocations } from "@/hooks/useLocations";
import { useReservationTables, useCreateTable, useUpdateTable, useDeleteTable, type ReservationTable, type TableShape } from "@/hooks/useReservations";
import { cn } from "@/lib/utils";

export default function ReservationFloorPage() {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId: globalLocationId } = useLocation();
  const { data: locations = [] } = useLocations();
  const rid = currentRestaurant?.id;
  const [searchParams] = useSearchParams();
  const highlightTableId = searchParams.get('highlight');

  // ── Local floor plan location (single source of truth) ──
  const [floorLocationId, setFloorLocationId] = useState<string | null>(null);

  // Initialize from global or first available location
  useEffect(() => {
    if (floorLocationId && locations.some(l => l.id === floorLocationId)) return;
    if (globalLocationId && locations.some(l => l.id === globalLocationId)) {
      setFloorLocationId(globalLocationId);
    } else if (locations.length > 0) {
      setFloorLocationId(locations[0].id);
    }
  }, [globalLocationId, locations, floorLocationId]);

  // All table queries/mutations use floorLocationId
  const { data: tables = [] } = useReservationTables(floorLocationId);
  const createTable = useCreateTable();
  const updateTable = useUpdateTable();
  const deleteTable = useDeleteTable();

  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [showAdd, setShowAdd] = useState(false);
  const [editTable, setEditTable] = useState<ReservationTable | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(highlightTableId);
  const [isSaving, setIsSaving] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const tablesRef = useRef(tables);
  tablesRef.current = tables;

  // Auto-highlight from URL param
  useEffect(() => {
    if (highlightTableId) {
      setSelectedTableId(highlightTableId);
      setMode('preview');
    }
  }, [highlightTableId]);

  // Add table form
  const [formName, setFormName] = useState("");
  const [formSeats, setFormSeats] = useState(4);
  const [formShape, setFormShape] = useState<TableShape>('rect');
  const [formArea, setFormArea] = useState("");

  const activeTables = tables.filter(t => t.is_active);

  const handleAddTable = async () => {
    if (!rid || !floorLocationId || !formName) return;
    await createTable.mutateAsync({
      restaurant_id: rid,
      location_id: floorLocationId,
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

  // ── Pointer-based drag ──
  const handlePointerDown = useCallback((e: React.PointerEvent, tableId: string) => {
    if (mode !== 'edit') return;
    e.preventDefault();
    e.stopPropagation();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const table = tablesRef.current.find(t => t.id === tableId);
    if (!table) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = Number(table.x);
    const origY = Number(table.y);
    const el = document.getElementById(`table-${tableId}`);
    let moved = false;

    setSelectedTableId(tableId);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
      const canvasRect = canvas.getBoundingClientRect();
      const maxX = canvasRect.width - Number(table.w);
      const maxY = canvasRect.height - Number(table.h);
      const newX = Math.max(0, Math.min(maxX, origX + dx));
      const newY = Math.max(0, Math.min(maxY, origY + dy));
      if (el) { el.style.left = `${newX}px`; el.style.top = `${newY}px`; }
    };

    const onUp = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (!moved) return;

      const canvasRect = canvas.getBoundingClientRect();
      const maxX = canvasRect.width - Number(table.w);
      const maxY = canvasRect.height - Number(table.h);
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const finalX = Math.max(0, Math.min(maxX, origX + dx));
      const finalY = Math.max(0, Math.min(maxY, origY + dy));

      setIsSaving(true);
      updateTable.mutate(
        { id: tableId, x: finalX, y: finalY },
        { onSettled: () => setIsSaving(false) }
      );
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [mode, updateTable]);

  const currentLocation = locations.find(l => l.id === floorLocationId);

  return (
    <PageLayout
      title="Floor Plan"
      subtitle={currentLocation ? `Layout for ${currentLocation.name}` : "Drag tables to arrange your floor layout"}
      action={
        <div className="flex items-center gap-2">
          {locations.length > 0 && (
            <Select value={floorLocationId || ''} onValueChange={setFloorLocationId}>
              <SelectTrigger className="w-[180px] gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent className="z-[100]">
                {locations.map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant={mode === 'edit' ? 'default' : 'outline'} size="sm" onClick={() => setMode('edit')}><Edit3 className="h-3.5 w-3.5 mr-1" /> Edit</Button>
          <Button variant={mode === 'preview' ? 'default' : 'outline'} size="sm" onClick={() => setMode('preview')}><Eye className="h-3.5 w-3.5 mr-1" /> Preview</Button>
          {mode === 'edit' && <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" /> Add Table</Button>}
          {isSaving && <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</Badge>}
        </div>
      }
    >
      {!floorLocationId && locations.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Create a location first to start building your floor plan.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div
              ref={canvasRef}
              className={cn(
                "relative border rounded-lg overflow-hidden touch-none",
                mode === 'edit' ? 'bg-muted/20' : 'bg-muted/30'
              )}
              style={{ height: 500, minWidth: 600 }}
              onClick={() => mode === 'edit' && setSelectedTableId(null)}
            >
              {mode === 'edit' && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-border/40" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>
              )}

              {activeTables.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground z-10">
                  No tables yet. Click "Add Table" to get started.
                </div>
              )}

              {activeTables.map(t => {
                const isHighlighted = selectedTableId === t.id;
                return (
                  <div
                    key={t.id}
                    id={`table-${t.id}`}
                    className={cn(
                      "absolute flex flex-col items-center justify-center border-2 text-xs font-medium select-none transition-all z-20",
                      t.shape === 'circle' ? 'rounded-full' : t.shape === 'square' ? 'rounded-md' : 'rounded-lg',
                      mode === 'edit'
                        ? 'cursor-grab active:cursor-grabbing hover:shadow-md border-primary/40 bg-card'
                        : 'cursor-default border-border bg-card/80',
                      isHighlighted && 'ring-4 ring-primary shadow-xl scale-110 border-primary z-30',
                    )}
                    style={{
                      left: Number(t.x),
                      top: Number(t.y),
                      width: Number(t.w),
                      height: Number(t.h),
                      touchAction: 'none',
                    }}
                    onPointerDown={e => handlePointerDown(e, t.id)}
                    onDoubleClick={() => mode === 'edit' && setEditTable(t)}
                  >
                    <span className="font-semibold">{t.name}</span>
                    <span className="text-muted-foreground text-[10px]">{t.seats} seats</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

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
            <div>
              <label className="text-xs font-medium">Location</label>
              <Input value={currentLocation?.name || ''} disabled className="bg-muted" />
            </div>
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
