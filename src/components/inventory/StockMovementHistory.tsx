import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { History, Undo2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLocation } from "@/contexts/LocationContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useStockLevels } from "@/hooks/useStock";
import { MOVEMENT_LABEL, REVERSIBLE, useReverseStockMovement, useStockMovements, type StockMovement } from "@/hooks/useStockMovements";
import { formatUnitCost } from "@/lib/currency";

/** Read-only ledger view with reversal (never edit/delete). */
export function StockMovementHistory() {
  const { selectedLocationId } = useLocation();
  const { data: movements = [], isLoading } = useStockMovements(selectedLocationId);
  const { data: levels = [] } = useStockLevels(selectedLocationId || undefined);
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("inventory", "edit");
  const reverse = useReverseStockMovement();
  const [target, setTarget] = useState<StockMovement | null>(null);
  const [reason, setReason] = useState("");

  const reversed = useMemo(() => new Set(movements.map((m) => m.reverses_movement_id).filter(Boolean)), [movements]);
  const negative = levels.filter((l) => Number(l.quantity) < 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">Stock movement history</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Every delivery, waste entry, count and correction is kept permanently. Mistakes are fixed with a reversal.
      </p>
      {negative.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <span>
            Negative stock — check counts/receipts: {negative.map((n) => n.ingredients?.name ?? "Item").join(", ")}
          </span>
        </div>
      )}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Unit cost</TableHead>
              <TableHead>Note</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-muted-foreground">Loading…</TableCell></TableRow>
            ) : movements.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-muted-foreground">No stock movements yet.</TableCell></TableRow>
            ) : (
              movements.map((m) => {
                const qty = Number(m.quantity);
                const canReverse = canEdit && REVERSIBLE.has(m.movement_type) && !reversed.has(m.id);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">{format(parseISO(m.effective_date), "d MMM yyyy")}</TableCell>
                    <TableCell>{m.ingredients?.name ?? "Item"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}</Badge>
                      {reversed.has(m.id) && <Badge variant="outline" className="ml-1 text-muted-foreground">Reversed</Badge>}
                    </TableCell>
                    <TableCell className={qty < 0 ? "text-right font-mono text-destructive" : "text-right font-mono"}>
                      {qty > 0 ? "+" : ""}{qty.toFixed(3)} {m.ingredients?.unit ?? ""}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.unit_cost == null ? <span className="text-warning">Unknown</span> : formatUnitCost(Number(m.unit_cost))}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[240px] truncate">{m.reason}</TableCell>
                    <TableCell>
                      {canReverse && (
                        <Button variant="outline" size="sm" className="h-11" onClick={() => { setTarget(m); setReason(""); }}>
                          <Undo2 className="h-4 w-4 mr-1" /> Reverse
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverse this entry?</DialogTitle>
            <DialogDescription>
              {target && `${MOVEMENT_LABEL[target.movement_type]} · ${target.ingredients?.name} · ${Number(target.quantity).toFixed(3)} ${target.ingredients?.unit ?? ""} on ${target.effective_date}.`}{" "}
              A reversing entry is added on the same date; the original stays visible.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="rev-reason">Reason (required)</Label>
            <Input id="rev-reason" className="h-11" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. entered twice" />
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setTarget(null)}>Cancel</Button>
            <Button
              className="h-11"
              disabled={reason.trim().length < 3 || reverse.isPending}
              onClick={() => target && reverse.mutate({ id: target.id, reason: reason.trim() }, { onSuccess: () => setTarget(null) })}
            >
              Reverse entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
