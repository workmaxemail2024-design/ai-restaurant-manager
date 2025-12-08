import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, ChevronRight, Link2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDishes, useCreateDish, useUpdateDish, useDeleteDish, useDishIngredients, useAddDishIngredient, useRemoveDishIngredient, Dish, DishInsert } from "@/hooks/useDishes";
import { useLocations } from "@/hooks/useLocations";
import { useIngredients } from "@/hooks/useIngredients";
import { usePOSMappings, useUpdatePOSMapping } from "@/hooks/usePOS";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";

const categories = ["Appetizers", "Mains", "Desserts", "Beverages", "Sides", "Other"];

export default function DishesPage() {
  const { data: dishes = [], isLoading } = useDishes();
  const { data: locations = [] } = useLocations();
  const { data: ingredients = [] } = useIngredients();
  const { data: posMappings = [] } = usePOSMappings(undefined, "captiva");
  const createDish = useCreateDish();
  const updateDish = useUpdateDish();
  const deleteDish = useDeleteDish();
  const addIngredient = useAddDishIngredient();
  const removeIngredient = useRemoveDishIngredient();
  const updateMapping = useUpdatePOSMapping();
  
  const [isOpen, setIsOpen] = useState(false);
  const [isRecipeOpen, setIsRecipeOpen] = useState(false);
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [editingItem, setEditingItem] = useState<Dish | null>(null);
  const [formData, setFormData] = useState<DishInsert>({ name: "", category: "", selling_price: 0 });
  const [recipeForm, setRecipeForm] = useState({ ingredient_id: "", quantity: 0 });
  
  const { data: dishIngredients = [] } = useDishIngredients(selectedDish?.id || null);

  // Get unmapped dishes from POS
  const dishMappings = posMappings.filter(m => m.mapping_type === "dish");
  const unmappedDishMappings = dishMappings.filter(m => !m.is_verified);

  const columns = [
    { key: "name", header: "Name" },
    { key: "category", header: "Category", render: (item: Dish) => item.category || "-" },
    { 
      key: "locations", 
      header: "Location",
      render: (item: Dish) => item.locations?.name || "All"
    },
    { 
      key: "selling_price", 
      header: "Price",
      render: (item: Dish) => formatCurrency(Number(item.selling_price))
    },
    { 
      key: "dish_cost", 
      header: "Cost",
      render: (item: Dish) => formatCurrency(Number(item.dish_cost || 0))
    },
    { 
      key: "profit_margin", 
      header: "Margin",
      render: (item: Dish) => {
        const margin = item.profit_margin || 0;
        return (
          <Badge className={cn(
            margin >= 60 ? "bg-success/20 text-success" : 
            margin >= 40 ? "bg-warning/20 text-warning" : 
            "bg-destructive/20 text-destructive"
          )}>
            {margin.toFixed(1)}%
          </Badge>
        );
      }
    },
    {
      key: "pos_mapping",
      header: "POS ID",
      render: (item: Dish) => (
        item.captiva_external_id ? (
          <Badge variant="default" className="bg-green-500/20 text-green-700 font-mono text-xs">
            <Link2 className="h-3 w-3 mr-1" />{item.captiva_external_id}
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-muted-foreground">-</Badge>
        )
      )
    },
    {
      key: "recipe",
      header: "Recipe",
      render: (item: Dish) => (
        <Button variant="ghost" size="sm" onClick={() => { setSelectedDish(item); setIsRecipeOpen(true); }}>
          View <ChevronRight className="h-4 w-4" />
        </Button>
      )
    }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      await updateDish.mutateAsync({ id: editingItem.id, ...formData });
    } else {
      await createDish.mutateAsync(formData);
    }
    handleClose();
  };

  const handleEdit = (item: Dish) => {
    setEditingItem(item);
    setFormData({ 
      name: item.name, 
      category: item.category || "", 
      location_id: item.location_id,
      selling_price: Number(item.selling_price)
    });
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setEditingItem(null);
    setFormData({ name: "", category: "", selling_price: 0 });
  };

  const handleAddIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDish) {
      await addIngredient.mutateAsync({ dish_id: selectedDish.id, ...recipeForm });
      setRecipeForm({ ingredient_id: "", quantity: 0 });
    }
  };

  const handleMapDish = (mappingId: string, dishId: string) => {
    updateMapping.mutate({ id: mappingId, internal_id: dishId, is_verified: true });
  };

  return (
    <PageLayout title="Menu / Dishes" subtitle="Manage your dishes and recipes">
      <Tabs defaultValue="dishes" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="dishes">Dishes</TabsTrigger>
            <TabsTrigger value="mapping" className="relative">
              POS Mapping
              {unmappedDishMappings.length > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {unmappedDishMappings.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          
          <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogTrigger asChild>
              <Button onClick={() => setIsOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Add Dish
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingItem ? "Edit Dish" : "Add Dish"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={formData.category || ""} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Location (optional)</Label>
                  <Select value={formData.location_id || "_all"} onValueChange={(v) => setFormData({ ...formData, location_id: v === "_all" ? null : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="All locations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All locations</SelectItem>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="price">Selling Price</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.selling_price}
                    onChange={(e) => setFormData({ ...formData, selling_price: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                  <Button type="submit" disabled={createDish.isPending || updateDish.isPending}>
                    {editingItem ? "Update" : "Create"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <TabsContent value="dishes">
          <DataTable
            data={dishes}
            columns={columns}
            isLoading={isLoading}
            onEdit={handleEdit}
            onDelete={(item) => deleteDish.mutate(item.id)}
          />
        </TabsContent>

        <TabsContent value="mapping">
          <Card>
            <CardHeader>
              <CardTitle>Dish POS Mapping</CardTitle>
              <CardDescription>Map Captiva external IDs to your menu dishes</CardDescription>
            </CardHeader>
            <CardContent>
              {dishMappings.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  No dishes imported from POS yet. Run a sync first.
                </p>
              ) : (
                <div className="space-y-3">
                  {dishMappings.map(mapping => (
                    <div key={mapping.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">{mapping.external_name || mapping.external_id}</p>
                        <p className="text-sm text-muted-foreground font-mono">ID: {mapping.external_id}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {mapping.is_verified ? (
                          <Badge variant="default" className="bg-green-500">Mapped</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-amber-600">
                            <AlertCircle className="h-3 w-3 mr-1" />Unmapped
                          </Badge>
                        )}
                        <Select 
                          value={mapping.internal_id || ""} 
                          onValueChange={v => handleMapDish(mapping.id, v)}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Select dish" />
                          </SelectTrigger>
                          <SelectContent>
                            {dishes.map(d => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Recipe Dialog */}
      <Dialog open={isRecipeOpen} onOpenChange={setIsRecipeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Recipe: {selectedDish?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <form onSubmit={handleAddIngredient} className="flex gap-2 items-end">
              <div className="flex-1">
                <Label>Ingredient</Label>
                <Select value={recipeForm.ingredient_id} onValueChange={(v) => setRecipeForm({ ...recipeForm, ingredient_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select ingredient" />
                  </SelectTrigger>
                  <SelectContent>
                    {ingredients.map((ing) => (
                      <SelectItem key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-32">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={recipeForm.quantity}
                  onChange={(e) => setRecipeForm({ ...recipeForm, quantity: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <Button type="submit" disabled={addIngredient.isPending || !recipeForm.ingredient_id}>
                Add
              </Button>
            </form>
            <div className="border border-border rounded-lg divide-y divide-border">
              {dishIngredients.length === 0 ? (
                <p className="p-4 text-muted-foreground text-center">No ingredients added yet</p>
              ) : (
                dishIngredients.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3">
                    <span>{item.ingredients?.name}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">{Number(item.quantity).toFixed(2)} {item.ingredients?.unit}</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-destructive"
                        onClick={() => removeIngredient.mutate({ id: item.id, dish_id: selectedDish!.id })}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
