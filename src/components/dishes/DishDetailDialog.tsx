import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import type { Dish } from "@/hooks/useDishes";
import { useDishIngredients, useAddDishIngredient, useRemoveDishIngredient, useUpdateDish } from "@/hooks/useDishes";
import { useIngredients, calculateBaseCost, getBaseUnit } from "@/hooks/useIngredients";
import { usePOSMappings } from "@/hooks/usePOS";
import { Link2, AlertCircle } from "lucide-react";
import { QuickAddIngredientDialog } from "@/components/dishes/QuickAddIngredientDialog";

interface Props {
  dish: Dish | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const ITEM_TYPES = [
  { value: "food", label: "Food" },
  { value: "drink", label: "Drink" },
  { value: "alcoholic", label: "Alcoholic" },
  { value: "non_alcoholic", label: "Non-alcoholic" },
  { value: "modifier", label: "Modifier / Side" },
  { value: "other", label: "Other" },
];

export function DishDetailDialog({ dish, open, onOpenChange }: Props) {
  const { data: dishIngredients = [] } = useDishIngredients(dish?.id || null);
  const { data: ingredients = [] } = useIngredients();
  const { data: mappings = [] } = usePOSMappings(undefined, "captiva");
  const addIngredient = useAddDishIngredient();
  const removeIngredient = useRemoveDishIngredient();
  const updateDish = useUpdateDish();

  const [recipeForm, setRecipeForm] = useState({ ingredient_id: "", quantity: 0 });
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const filteredIngredients = ingredients.filter((i) =>
    i.name.toLowerCase().includes(ingredientSearch.trim().toLowerCase())
  );
  const [directCost, setDirectCost] = useState<number>(0);
  const [useDirect, setUseDirect] = useState<boolean>(false);
  const [itemType, setItemType] = useState<string>("food");
  const [needsReview, setNeedsReview] = useState<boolean>(false);
  const [isActive, setIsActive] = useState<boolean>(true);

  useEffect(() => {
    if (dish) {
      setDirectCost(Number(dish.direct_cost || 0));
      setUseDirect(Boolean(dish.use_direct_cost));
      setItemType(dish.item_type || "food");
      setNeedsReview(Boolean(dish.needs_review));
      setIsActive(dish.is_active !== false);
    }
  }, [dish?.id]);

  if (!dish) return null;

  const recipeCost = dishIngredients.reduce((sum, item) => {
    const ing = ingredients.find(i => i.id === item.ingredient_id);
    const base = ing ? calculateBaseCost(ing) : 0;
    return sum + base * Number(item.quantity);
  }, 0);

  const effectiveCost = useDirect ? (directCost || null) : (dishIngredients.length > 0 ? recipeCost : null);
  const price = Number(dish.selling_price);
  const margin = effectiveCost !== null && price > 0 ? ((price - effectiveCost) / price) * 100 : null;
  const foodCostPct = effectiveCost !== null && price > 0 ? (effectiveCost / price) * 100 : null;
  const grossProfit = effectiveCost !== null ? price - effectiveCost : null;

  const dishMapping = mappings.find(m => m.mapping_type === "dish" && m.internal_id === dish.id);

  const handleAddIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipeForm.ingredient_id || recipeForm.quantity <= 0) return;
    await addIngredient.mutateAsync({ dish_id: dish.id, ...recipeForm });
    setRecipeForm({ ingredient_id: "", quantity: 0 });
  };

  const saveOverview = () => {
    updateDish.mutate({
      id: dish.id,
      item_type: itemType,
      needs_review: needsReview,
      is_active: isActive,
    });
  };

  const saveDirectCost = () => {
    updateDish.mutate({
      id: dish.id,
      direct_cost: useDirect ? directCost : null,
      use_direct_cost: useDirect,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {dish.name}
            {dish.needs_review && <Badge variant="secondary" className="bg-warning/15 text-warning">Needs review</Badge>}
            {!isActive && <Badge variant="outline">Inactive</Badge>}
            {dishMapping && (
              <Badge variant="secondary" className="bg-success/15 text-success font-mono text-xs">
                <Link2 className="h-3 w-3 mr-1" />{dishMapping.external_id}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="flex-1 overflow-y-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="recipe">Recipe / Ingredients</TabsTrigger>
            <TabsTrigger value="pos">POS Mapping</TabsTrigger>
            <TabsTrigger value="cost">Cost &amp; Margin</TabsTrigger>
            <TabsTrigger value="sales">Sales</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">Category:</span> {dish.category || "—"}</div>
              <div><span className="text-muted-foreground">Department:</span> {dish.department || "—"}</div>
              <div><span className="text-muted-foreground">Location:</span> {dish.locations?.name || "All"}</div>
              <div><span className="text-muted-foreground">Selling Price:</span> {formatCurrency(price)}</div>
            </div>

            <div className="space-y-3 pt-2 border-t">
              <div>
                <Label>Item Type</Label>
                <Select value={itemType} onValueChange={setItemType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ITEM_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="needs-review">Needs review</Label>
                <Switch id="needs-review" checked={needsReview} onCheckedChange={setNeedsReview} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="active">Active</Label>
                <Switch id="active" checked={isActive} onCheckedChange={setIsActive} />
              </div>
              <Button onClick={saveOverview} disabled={updateDish.isPending}>Save</Button>
            </div>
          </TabsContent>

          {/* RECIPE */}
          <TabsContent value="recipe" className="space-y-4 pt-4">
            {useDirect ? (
              <div className="p-4 rounded-lg border bg-muted/30 text-sm text-muted-foreground">
                This dish uses a direct product cost ({formatCurrency(directCost)}). Recipe ingredients are ignored.
                Turn off "Use direct cost" in the Cost &amp; Margin tab to switch to recipe mode.
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Quantities are the amount consumed when <strong>one</strong> unit of this dish is sold
                  (e.g. 1 each chicken breast, 250 g potato, 80 ml cream).
                </p>

                <form onSubmit={handleAddIngredient} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label>Ingredient</Label>
                    <Select
                      value={recipeForm.ingredient_id}
                      onValueChange={(v) => {
                        if (v === "_new") {
                          setQuickAddOpen(true);
                          return;
                        }
                        setRecipeForm({ ...recipeForm, ingredient_id: v });
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select ingredient" /></SelectTrigger>
                      <SelectContent>
                        <div className="p-1 sticky top-0 bg-popover z-10">
                          <Input
                            placeholder="Search ingredients..."
                            value={ingredientSearch}
                            onChange={(e) => setIngredientSearch(e.target.value)}
                            onKeyDown={(e) => e.stopPropagation()}
                            className="h-8"
                          />
                        </div>
                        <SelectItem value="_new">+ Add new ingredient</SelectItem>
                        {filteredIngredients.map((ing) => {
                          const bc = calculateBaseCost(ing);
                          const bu = getBaseUnit(ing.pack_unit);
                          return <SelectItem key={ing.id} value={ing.id}>{ing.name} — {formatCurrency(bc)}/{bu}</SelectItem>;
                        })}
                        {filteredIngredients.length === 0 && (
                          <p className="px-2 py-3 text-sm text-muted-foreground">No matching ingredient</p>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-32">
                    <Label>Qty ({recipeForm.ingredient_id ? getBaseUnit(ingredients.find(i => i.id === recipeForm.ingredient_id)?.pack_unit) : "unit"})</Label>
                    <Input type="number" step="0.01" min="0" value={recipeForm.quantity}
                      onChange={(e) => setRecipeForm({ ...recipeForm, quantity: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <Button type="submit" disabled={addIngredient.isPending || !recipeForm.ingredient_id}>Add</Button>
                </form>

                <QuickAddIngredientDialog
                  open={quickAddOpen}
                  onOpenChange={setQuickAddOpen}
                  initialName={ingredientSearch}
                  onCreated={(id) => {
                    setRecipeForm({ ingredient_id: id, quantity: 0 });
                    setIngredientSearch("");
                  }}
                />


                <div className="border rounded-lg divide-y">
                  <div className="grid grid-cols-5 gap-2 p-3 bg-muted/50 text-xs font-medium text-muted-foreground uppercase">
                    <span>Ingredient</span>
                    <span className="text-right">Qty</span>
                    <span className="text-right">Unit</span>
                    <span className="text-right">Unit cost</span>
                    <span className="text-right">Line cost</span>
                  </div>
                  {dishIngredients.length === 0 ? (
                    <p className="p-4 text-muted-foreground text-center text-sm">No ingredients added yet. Cost will show as "Missing".</p>
                  ) : (
                    <>
                      {dishIngredients.map((item) => {
                        const ing = ingredients.find(i => i.id === item.ingredient_id);
                        const bc = ing ? calculateBaseCost(ing) : 0;
                        const bu = getBaseUnit(ing?.pack_unit);
                        const line = bc * Number(item.quantity);
                        return (
                          <div key={item.id} className="grid grid-cols-5 gap-2 p-3 items-center text-sm">
                            <span className="font-medium">{item.ingredients?.name}</span>
                            <span className="text-right">{Number(item.quantity).toFixed(2)}</span>
                            <span className="text-right text-muted-foreground">{bu}</span>
                            <span className="text-right text-muted-foreground">{formatCurrency(bc)}/{bu}</span>
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-medium">{formatCurrency(line)}</span>
                              <Button variant="ghost" size="sm" className="text-destructive h-6 w-6 p-0"
                                onClick={() => removeIngredient.mutate({ id: item.id, dish_id: dish.id })}>×</Button>
                            </div>
                          </div>
                        );
                      })}
                      <div className="grid grid-cols-5 gap-2 p-3 bg-muted/30 items-center border-t-2">
                        <span className="font-semibold col-span-4">Total recipe cost</span>
                        <span className="text-right font-semibold">{formatCurrency(recipeCost)}</span>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          {/* POS */}
          <TabsContent value="pos" className="space-y-3 pt-4 text-sm">
            {dishMapping ? (
              <div className="p-4 rounded-lg border bg-success/5">
                <div className="flex items-center gap-2 mb-2">
                  <Link2 className="h-4 w-4 text-success" />
                  <span className="font-medium">Linked to POS</span>
                </div>
                <div><span className="text-muted-foreground">External ID:</span> <span className="font-mono">{dishMapping.external_id}</span></div>
                <div><span className="text-muted-foreground">External name:</span> {dishMapping.external_name || "—"}</div>
                <div><span className="text-muted-foreground">Verified:</span> {dishMapping.is_verified ? "Yes" : "No"}</div>
              </div>
            ) : (
              <div className="p-4 rounded-lg border bg-warning/5 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-warning" />
                Not linked to any POS item. Sales won't attribute to this dish.
              </div>
            )}
          </TabsContent>

          {/* COST */}
          <TabsContent value="cost" className="space-y-4 pt-4">
            <Card className="bg-muted/30">
              <CardContent className="pt-4">
                <div className="grid grid-cols-4 gap-4 text-center">
                  <Stat label="Selling price" value={formatCurrency(price)} />
                  <Stat label="Cost" value={effectiveCost !== null ? formatCurrency(effectiveCost) : "Missing"} tone={effectiveCost === null ? "warn" : undefined} />
                  <Stat label="Food cost %" value={foodCostPct !== null ? `${foodCostPct.toFixed(1)}%` : "Missing"} tone={foodCostPct === null ? "warn" : undefined} />
                  <Stat label="Margin %" value={margin !== null ? `${margin.toFixed(1)}%` : "Incomplete"} tone={margin === null ? "warn" : margin >= 60 ? "good" : margin >= 40 ? "warn" : "bad"} />
                </div>
                {grossProfit !== null && (
                  <div className="text-center text-sm text-muted-foreground pt-3 border-t mt-3">
                    Gross profit per unit: <span className="font-medium text-foreground">{formatCurrency(grossProfit)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-3 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="use-direct" className="text-base">Use direct product cost</Label>
                  <p className="text-xs text-muted-foreground">For drinks and packaged products without a recipe.</p>
                </div>
                <Switch id="use-direct" checked={useDirect} onCheckedChange={setUseDirect} />
              </div>
              {useDirect && (
                <div>
                  <Label>Direct cost</Label>
                  <Input type="number" step="0.01" min="0" value={directCost}
                    onChange={(e) => setDirectCost(parseFloat(e.target.value) || 0)} />
                </div>
              )}
              <Button onClick={saveDirectCost} disabled={updateDish.isPending}>Save cost settings</Button>
            </div>
          </TabsContent>

          {/* SALES */}
          <TabsContent value="sales" className="pt-4 text-sm text-muted-foreground">
            Sales performance for this dish is available in Menu Performance and Reports, filtered to the selected date range.
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={cn(
        "text-lg font-semibold",
        tone === "good" && "text-success",
        tone === "warn" && "text-warning",
        tone === "bad" && "text-destructive",
      )}>{value}</p>
    </div>
  );
}
