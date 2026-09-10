import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, ClipboardCheck, AlertCircle } from "lucide-react";
import { useLocation } from "@/contexts/LocationContext";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useIngredients, INVENTORY_ITEM_GROUPS, INVENTORY_CATEGORIES, groupLabel, categoryLabel } from "@/hooks/useIngredients";
import { useStockLevels } from "@/hooks/useStock";
import { useCreateStockCount } from "@/hooks/useStockCounts";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ScopeType = "all" | "group" | "category";

interface CountLine {
  ingredient_id: string;
  name: string;
  unit: string;
  group: string | null;
  category: string | null;
  expected_quantity: number;
  counted_quantity: number;
}

export function StockCountDialog({ open, onOpenChange }: Props) {
  const { selectedLocationId } = useLocation();
  const { currentRestaurant } = useRestaurant();
  const { data: ingredients = [] } = useIngredients();
  const { data: stockLevels = [] } = useStockLevels(selectedLocationId);
  const createCount = useCreateStockCount();

  const [countDate, setCountDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [scopeType, setScopeType] = useState<ScopeType>("all");
  const [scopeValue, setScopeValue] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [step, setStep] = useState<"select" | "count" | "review">("select");
  const [lines, setLines] = useState<CountLine[]>([]);

  const stockByIngredient = useMemo(() => {
    const map = new Map<string, number>();
    for (const sl of stockLevels) {
      map.set(sl.ingredient_id, Number(sl.quantity) || 0);
    }
    return map;
  }, [stockLevels]);

  const availableItems = useMemo(() => {
    return ingredients
      .filter((ing) => {
        if (scopeType === "all") return true;
        if (scopeType === "group") return ing.item_group === scopeValue;
        if (scopeType === "category") return ing.category === scopeValue;
        return true;
      })
      .map((ing) => ({
        ingredient_id: ing.id,
        name: ing.name,
        unit: ing.unit,
        group: ing.item_group,
        category: ing.category,
        expected_quantity: stockByIngredient.get(ing.id) ?? 0,
        counted_quantity: stockByIngredient.get(ing.id) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ingredients, scopeType, scopeValue, stockByIngredient]);

  const selectedGroupCategories = useMemo(() => {
    if (scopeType === "group") {
      return INVENTORY_CATEGORIES.filter((c) => c.group === scopeValue || !c.group);
    }
    return INVENTORY_CATEGORIES;
  }, [scopeType, scopeValue]);

  const changedLines = useMemo(
    () => lines.filter((l) => Math.abs(l.counted_quantity - l.expected_quantity) > 0.0001),
    [lines]
  );

  const startCount = () => {
    setLines(availableItems);
    setStep("count");
  };

  const updateCounted = (ingredientId: string, value: string) => {
    const num = value === "" ? 0 : parseFloat(value);
    setLines((prev) =>
      prev.map((l) => (l.ingredient_id === ingredientId ? { ...l, counted_quantity: num } : l))
    );
  };

  const reset = () => {
    setStep("select");
    setLines([]);
    setNotes("");
    setCountDate(format(new Date(), "yyyy-MM-dd"));
    setScopeType("all");
    setScopeValue("");
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!currentRestaurant?.id || !selectedLocationId) return;
    await createCount.mutateAsync({
      restaurant_id: currentRestaurant.id,
      location_id: selectedLocationId,
      count_date: countDate,
      scope_type: scopeType,
      scope_value: scopeType === "all" ? null : scopeValue,
      notes,
      lines: lines.map((l) => ({
        ingredient_id: l.ingredient_id,
        expected_quantity: l.expected_quantity,
        counted_quantity: l.counted_quantity,
      })),
    });
    handleClose();
  };

  const canStart = scopeType === "all" || !!scopeValue;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Count Stock
          </DialogTitle>
          <DialogDescription>
            Record a physical stock count. Only changed quantities create adjustments; expected quantities come from current stock on hand.
          </DialogDescription>
        </DialogHeader>

        {step === "select" && (
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="count-date">Count date</Label>
                <Input
                  id="count-date"
                  type="date"
                  value={countDate}
                  onChange={(e) => setCountDate(e.target.value)}
                  className="min-h-[44px]"
                />
              </div>
              <div>
                <Label>Scope</Label>
                <Select value={scopeType} onValueChange={(v: ScopeType) => { setScopeType(v); setScopeValue(""); }}>
                  <SelectTrigger className="min-h-[44px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All inventory</SelectItem>
                    <SelectItem value="group">Group</SelectItem>
                    <SelectItem value="category">Category</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {scopeType === "group" && (
              <div>
                <Label>Select group</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {INVENTORY_ITEM_GROUPS.map((g) => (
                    <Button
                      key={g.value}
                      type="button"
                      variant={scopeValue === g.value ? "default" : "outline"}
                      onClick={() => setScopeValue(g.value)}
                      className="min-h-[44px]"
                    >
                      {g.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {scopeType === "category" && (
              <div>
                <Label>Select category</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedGroupCategories.map((c) => (
                    <Button
                      key={c.value}
                      type="button"
                      variant={scopeValue === c.value ? "default" : "outline"}
                      onClick={() => setScopeValue(c.value)}
                      className="min-h-[44px]"
                    >
                      {c.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground flex gap-2">
              <Package className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {availableItems.length} item{availableItems.length === 1 ? "" : "s"} ready to count
                {scopeType !== "all" && scopeValue
                  ? ` — ${scopeType === "group" ? groupLabel(scopeValue) : categoryLabel(scopeValue)}`
                  : ""}
                .
              </span>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose} className="min-h-[44px]">
                Cancel
              </Button>
              <Button type="button" disabled={!canStart || availableItems.length === 0} onClick={startCount} className="min-h-[44px]">
                Start Count
              </Button>
            </div>
          </div>
        )}

        {step === "count" && (
          <div className="flex flex-col flex-1 min-h-0 space-y-4">
            <div className="text-sm text-muted-foreground">
              {lines.length} items · {changedLines.length} changed
            </div>
            <div className="border rounded-md overflow-auto flex-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Group / Category</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right w-32">Counted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.ingredient_id}>
                      <TableCell className="font-medium">
                        {line.name}
                        <div className="text-xs text-muted-foreground">{line.unit}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">{groupLabel(line.group)}</div>
                        <div className="text-xs text-muted-foreground">{categoryLabel(line.category)}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {line.expected_quantity.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.counted_quantity === 0 ? "" : line.counted_quantity}
                          onChange={(e) => updateCounted(line.ingredient_id, e.target.value)}
                          className="w-28 ml-auto text-right min-h-[44px]"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep("select")} className="min-h-[44px]">
                Back
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleClose} className="min-h-[44px]">
                  Cancel
                </Button>
                <Button type="button" onClick={() => setStep("review")} className="min-h-[44px]">
                  Review
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="flex flex-col flex-1 min-h-0 space-y-4">
            <Tabs defaultValue="changed" className="flex-1 flex flex-col min-h-0">
              <TabsList className="self-start">
                <TabsTrigger value="changed" className="min-h-[40px]">
                  Differences ({changedLines.length})
                </TabsTrigger>
                <TabsTrigger value="all" className="min-h-[40px]">
                  All items ({lines.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="changed" className="flex-1 min-h-0 overflow-auto border rounded-md mt-2">
                {changedLines.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No differences found — all counted quantities match expected stock.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Expected</TableHead>
                        <TableHead className="text-right">Counted</TableHead>
                        <TableHead className="text-right">Difference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {changedLines.map((line) => {
                        const diff = line.counted_quantity - line.expected_quantity;
                        return (
                          <TableRow key={line.ingredient_id}>
                            <TableCell className="font-medium">
                              {line.name}
                              <div className="text-xs text-muted-foreground">{line.unit}</div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {line.expected_quantity.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {line.counted_quantity.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              <Badge variant={diff > 0 ? "default" : "destructive"}>
                                {diff > 0 ? "+" : ""}
                                {diff.toFixed(2)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
              <TabsContent value="all" className="flex-1 min-h-0 overflow-auto border rounded-md mt-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Expected</TableHead>
                      <TableHead className="text-right">Counted</TableHead>
                      <TableHead className="text-right">Difference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => {
                      const diff = line.counted_quantity - line.expected_quantity;
                      return (
                        <TableRow key={line.ingredient_id}>
                          <TableCell className="font-medium">{line.name}</TableCell>
                          <TableCell className="text-right font-mono">
                            {line.expected_quantity.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {line.counted_quantity.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {diff === 0 ? (
                              <span className="text-muted-foreground">0.00</span>
                            ) : (
                              <Badge variant={diff > 0 ? "default" : "destructive"}>
                                {diff > 0 ? "+" : ""}
                                {diff.toFixed(2)}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>

            <div>
              <Label htmlFor="count-notes">Notes (optional)</Label>
              <Input
                id="count-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Weekly freezer count"
                className="min-h-[44px]"
              />
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep("count")} className="min-h-[44px]">
                Back
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleClose} className="min-h-[44px]">
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={createCount.isPending}
                  className="min-h-[44px]"
                >
                  {createCount.isPending ? "Submitting…" : "Submit Count"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
