import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, CheckCircle2, Package, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIngredients } from "@/hooks/useIngredients";
import { useDailyLedger } from "@/hooks/useDailyLedger";
import {
  DAY_STOCK_REASONS,
  useDayStockAdjustments,
  useRecordDayStockAdjustment,
} from "@/hooks/useDayStock";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  locationId: string | null;
}

export function StockWastageDialog({ open, onOpenChange, date, locationId }: Props) {
  const { data: ingredients = [] } = useIngredients();
  const { data: adjustments = [], isLoading } = useDayStockAdjustments(date, locationId);
  const record = useRecordDayStockAdjustment();
  const { entries, upsert, isSaving } = useDailyLedger(date, date, locationId);
  const ledger = entries.get(date);

  const [ingredientId, setIngredientId] = useState<string>("");
  const [reasonLabel, setReasonLabel] = useState<string>("Wastage");
  const [quantity, setQuantity] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [mode, setMode] = useState<"adjust" | "count">("adjust");

  useEffect(() => {
    if (open) {
      setIngredientId("");
      setReasonLabel("Wastage");
      setQuantity("");
      setNote("");
      setMode("adjust");
    }
  }, [open, date, locationId]);

  const selectedIngredient = useMemo(
    () => ingredients.find((i) => i.id === ingredientId),
    [ingredients, ingredientId]
  );

  const invalidCount = adjustments.filter((a) => a.isInvalid).length;
  const reviewed = ledger?.stock_reviewed === true;

  const saveAdjustment = () => {
    if (!locationId) {
      toast({ title: "Select a location before saving", variant: "destructive" });
      return;
    }
    if (!ingredientId) {
      toast({ title: "Choose an item", variant: "destructive" });
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0 || (mode === "adjust" && qty <= 0)) {
      toast({ title: "Enter a valid quantity", variant: "destructive" });
      return;
    }
    const reason = DAY_STOCK_REASONS.find((r) => r.label === reasonLabel) ?? DAY_STOCK_REASONS[0];
    record.mutate(
      {
        ingredientId,
        locationId,
        quantity: mode === "adjust" ? qty : 0,
        spotCount: mode === "count" ? qty : null,
        adjustmentType: mode === "count" ? "correction" : reason.type,
        reasonLabel: mode === "count" ? "Spot count" : reason.label,
        note: note || null,
      },
      {
        onSuccess: () => {
          setIngredientId("");
          setQuantity("");
          setNote("");
        },
      }
    );
  };

  const setReviewed = (value: boolean) => {
    if (!locationId) {
      toast({ title: "Select a location before confirming", variant: "destructive" });
      return;
    }
    upsert({
      entry_date: date,
      location_id: locationId,
      covers: ledger?.covers ?? 0,
      labour_hours: ledger?.labour_hours ?? 0,
      additional_expenses: ledger?.additional_expenses ?? 0,
      notes: ledger?.notes ?? "",
      is_closed: ledger?.is_closed ?? false,
      manual_revenue: ledger?.manual_revenue ?? null,
      manual_orders: ledger?.manual_orders ?? null,
      covers_unknown: ledger?.covers_unknown ?? false,
      stock_reviewed: value,
    });
    toast({ title: value ? "Stock review confirmed" : "Stock review reopened" });
    if (value) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Stock / Wastage review</DialogTitle>
          <DialogDescription>
            {format(parseISO(date), "EEE d MMM yyyy")} ·{" "}
            {locationId ? "Selected location" : "All locations"}
          </DialogDescription>
        </DialogHeader>

        {!locationId && (
          <p className="text-sm text-warning">
            Select a specific location to record wastage or confirm the day.
          </p>
        )}

        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              variant={mode === "adjust" ? "default" : "outline"}
              className="h-12 flex-1"
              onClick={() => setMode("adjust")}
            >
              Wastage / adjustment
            </Button>
            <Button
              variant={mode === "count" ? "default" : "outline"}
              className="h-12 flex-1"
              onClick={() => setMode("count")}
            >
              Spot count
            </Button>
          </div>

          <div>
            <Label>Item</Label>
            <Select value={ingredientId} onValueChange={setIngredientId}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="Choose an ingredient" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {ingredients.map((i) => (
                  <SelectItem key={i.id} value={i.id} className="h-11">
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>
                {mode === "count" ? "Counted quantity" : "Quantity"}
                {selectedIngredient ? ` (${selectedIngredient.unit})` : ""}
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                className="h-12 text-base"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div>
              <Label>Reason</Label>
              <Select
                value={mode === "count" ? "Stock correction" : reasonLabel}
                onValueChange={setReasonLabel}
                disabled={mode === "count"}
              >
                <SelectTrigger className="h-12 text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_STOCK_REASONS.map((r) => (
                    <SelectItem key={r.label} value={r.label} className="h-11">
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Note (optional)</Label>
            <Input
              className="h-12 text-base"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. dropped tray at service"
            />
          </div>

          <Button
            className="h-12 w-full"
            disabled={!locationId || record.isPending}
            onClick={saveAdjustment}
          >
            <Plus className="h-4 w-4 mr-2" />
            Record {mode === "count" ? "spot count" : "adjustment"}
          </Button>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Recorded today</h4>
            {invalidCount > 0 && (
              <Badge variant="outline" className="border-warning text-warning">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {invalidCount} need review
              </Badge>
            )}
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : adjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No wastage or adjustments recorded for this day.
            </p>
          ) : (
            adjustments.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg border p-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{a.ingredientName}</p>
                    <p className="text-xs text-muted-foreground">{a.reason ?? a.adjustment_type}</p>
                  </div>
                </div>
                <span className={a.isInvalid ? "text-warning font-medium" : "font-medium"}>
                  {a.quantity} {a.unit}
                </span>
              </div>
            ))
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-12 px-6" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {reviewed ? (
            <Button
              variant="outline"
              className="h-12 px-6"
              disabled={isSaving || !locationId}
              onClick={() => setReviewed(false)}
            >
              Reopen review
            </Button>
          ) : (
            <Button
              className="h-12 px-6"
              disabled={isSaving || !locationId}
              onClick={() => setReviewed(true)}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {adjustments.length === 0 ? "Confirm no wastage" : "Confirm stock reviewed"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
