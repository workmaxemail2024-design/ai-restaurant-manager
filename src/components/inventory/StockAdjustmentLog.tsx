import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, AlertTriangle, Package } from "lucide-react";
import { useStockAdjustments, useCreateStockAdjustment, AdjustmentType } from "@/hooks/useStockAdjustments";
import { useIngredients } from "@/hooks/useIngredients";
import { useLocations } from "@/hooks/useLocations";
import { useLocation } from "@/contexts/LocationContext";
import { format } from "date-fns";

const ADJUSTMENT_TYPES: { value: AdjustmentType; label: string; color: string }[] = [
  { value: "waste", label: "Waste", color: "bg-amber-500" },
  { value: "spoilage", label: "Spoilage", color: "bg-orange-500" },
  { value: "theft", label: "Theft", color: "bg-red-500" },
  { value: "damage", label: "Damage", color: "bg-rose-500" },
  { value: "correction", label: "Correction", color: "bg-blue-500" },
  { value: "other", label: "Other", color: "bg-muted-foreground" },
];

export function StockAdjustmentLog() {
  const { selectedLocationId } = useLocation();
  const { data: adjustments = [], isLoading } = useStockAdjustments(selectedLocationId);
  const { data: ingredients = [] } = useIngredients();
  const { data: locations = [] } = useLocations();
  const createAdjustment = useCreateStockAdjustment();

  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    ingredient_id: "",
    location_id: selectedLocationId || "",
    adjustment_type: "waste" as AdjustmentType,
    quantity: 0,
    reason: "",
    adjusted_by: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.ingredient_id || !formData.location_id || formData.quantity <= 0) return;

    await createAdjustment.mutateAsync({
      ingredient_id: formData.ingredient_id,
      location_id: formData.location_id,
      adjustment_type: formData.adjustment_type,
      quantity: formData.quantity,
      reason: formData.reason || undefined,
      adjusted_by: formData.adjusted_by || undefined,
    });

    setIsOpen(false);
    setFormData({
      ingredient_id: "",
      location_id: selectedLocationId || "",
      adjustment_type: "waste",
      quantity: 0,
      reason: "",
      adjusted_by: "",
    });
  };

  const getTypeConfig = (type: string) => {
    return ADJUSTMENT_TYPES.find((t) => t.value === type) || ADJUSTMENT_TYPES[5];
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Stock Adjustment Log</h3>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" /> Log Adjustment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log Stock Adjustment</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Ingredient</Label>
                <Select
                  value={formData.ingredient_id}
                  onValueChange={(v) => setFormData({ ...formData, ingredient_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select ingredient" />
                  </SelectTrigger>
                  <SelectContent>
                    {ingredients.map((ing) => (
                      <SelectItem key={ing.id} value={ing.id}>
                        {ing.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Location</Label>
                <Select
                  value={formData.location_id}
                  onValueChange={(v) => setFormData({ ...formData, location_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Adjustment Type</Label>
                <Select
                  value={formData.adjustment_type}
                  onValueChange={(v) =>
                    setFormData({ ...formData, adjustment_type: v as AdjustmentType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ADJUSTMENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="quantity">Quantity Lost</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.quantity || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })
                  }
                  required
                />
              </div>

              <div>
                <Label htmlFor="reason">Reason / Notes</Label>
                <Textarea
                  id="reason"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Optional details..."
                  rows={2}
                />
              </div>

              <div>
                <Label htmlFor="adjusted_by">Recorded By</Label>
                <Input
                  id="adjusted_by"
                  value={formData.adjusted_by}
                  onChange={(e) => setFormData({ ...formData, adjusted_by: e.target.value })}
                  placeholder="Your name"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createAdjustment.isPending}>
                  Log Adjustment
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading adjustments...</div>
      ) : adjustments.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border rounded-md bg-muted/30">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No stock adjustments recorded</p>
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Ingredient</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty Lost</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adjustments.map((adj) => {
                const typeConfig = getTypeConfig(adj.adjustment_type);
                return (
                  <TableRow key={adj.id}>
                    <TableCell className="text-sm">
                      {format(new Date(adj.created_at), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell className="font-medium">{adj.ingredients?.name}</TableCell>
                    <TableCell>{adj.locations?.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={typeConfig.color + " text-white"}>
                        {typeConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      -{Number(adj.quantity).toFixed(2)} {adj.ingredients?.unit}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {adj.reason || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{adj.adjusted_by || "-"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
