import { useState, useMemo } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, ChevronRight, Link2, AlertCircle, Search, X, Trash2, Filter, Upload, ChevronDown, ChevronUp } from "lucide-react";
import { MenuUploadDialog } from "@/components/dishes/MenuUploadDialog";
import { DishCategorySection } from "@/components/dishes/DishCategorySection";
import { DishDetailDialog } from "@/components/dishes/DishDetailDialog";
import { MenuSelector } from "@/components/menus/MenuSelector";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDishes, useCreateDish, useUpdateDish, useDeleteDish, useDishIngredients, useAddDishIngredient, useRemoveDishIngredient, Dish, DishInsert } from "@/hooks/useDishes";
import { useLocations } from "@/hooks/useLocations";
import { useIngredients, calculateBaseCost, getBaseUnit } from "@/hooks/useIngredients";
import { usePOSMappings, useUpdatePOSMapping, useDeletePOSMapping, useBulkDeletePOSMappings } from "@/hooks/usePOS";
import { useMenuDishes } from "@/hooks/useMenus";
import { useLocation } from "@/contexts/LocationContext";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";

const categories = ["Appetizers", "Mains", "Desserts", "Beverages", "Sides", "Other"];

// Category display order for visual hierarchy
const categoryDisplayOrder = ["Appetizers", "Starters", "Mains", "Sides", "Desserts", "Beverages", "Drinks", "Other"];

type MappingStatusFilter = "all" | "mapped" | "unmapped";
type CategoryFilter = "all" | string;

export default function DishesPage() {
  const { selectedLocationId } = useLocation();
  const { data: allDishes = [], isLoading } = useDishes(selectedLocationId, { includeArchived: true });
  const [showArchived, setShowArchived] = useState(false);
  // Archived dishes stay out of the normal working view but keep every link.
  const dishes = useMemo(
    () => allDishes.filter((d) => (showArchived ? !!d.archived_at : !d.archived_at)),
    [allDishes, showArchived]
  );
  const archivedCount = useMemo(() => allDishes.filter((d) => !!d.archived_at).length, [allDishes]);
  const { data: locations = [] } = useLocations();
  const { data: ingredients = [] } = useIngredients();
  const { data: posMappings = [] } = usePOSMappings(undefined, "captiva");
  const createDish = useCreateDish();
  const updateDish = useUpdateDish();
  const deleteDish = useDeleteDish();
  const addIngredient = useAddDishIngredient();
  const removeIngredient = useRemoveDishIngredient();
  const updateMapping = useUpdatePOSMapping();
  const deleteMapping = useDeletePOSMapping();
  const bulkDeleteMappings = useBulkDeletePOSMappings();
  
  const [isOpen, setIsOpen] = useState(false);
  const [isRecipeOpen, setIsRecipeOpen] = useState(false);
  const [isMenuUploadOpen, setIsMenuUploadOpen] = useState(false);
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [editingItem, setEditingItem] = useState<Dish | null>(null);
  const [formData, setFormData] = useState<DishInsert>({ name: "", category: "", selling_price: 0 });
  const [recipeForm, setRecipeForm] = useState({ ingredient_id: "", quantity: 0 });
  const [mappingSearch, setMappingSearch] = useState("");
  const [mappingStatusFilter, setMappingStatusFilter] = useState<MappingStatusFilter>("all");
  const [showSimOnlyMappings, setShowSimOnlyMappings] = useState(false);
  
  // Dishes tab filters
  const [dishSearch, setDishSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [allExpanded, setAllExpanded] = useState(true);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  
  const { data: dishIngredients = [] } = useDishIngredients(selectedDish?.id || null);
  const { data: menuDishes = [] } = useMenuDishes(selectedMenuId);

  // Get dish mappings from POS
  const dishMappings = posMappings.filter(m => m.mapping_type === "dish");
  const unmappedDishMappings = dishMappings.filter(m => !m.is_verified || !m.internal_id);
  const simMappingsCount = dishMappings.filter(m => m.external_id.startsWith("SIM-")).length;

  // Filter mappings
  const filteredDishMappings = dishMappings.filter(mapping => {
    const matchesSearch = mappingSearch === "" ||
      (mapping.external_name || mapping.external_id).toLowerCase().includes(mappingSearch.toLowerCase());
    const matchesStatus = mappingStatusFilter === "all" ||
      (mappingStatusFilter === "mapped" ? mapping.internal_id !== null : mapping.internal_id === null);
    const matchesSim = !showSimOnlyMappings || mapping.external_id.startsWith("SIM-");
    return matchesSearch && matchesStatus && matchesSim;
  });

  // Get dish IDs in selected menu
  const menuDishIds = useMemo(() => {
    if (!selectedMenuId || !menuDishes.length) return null;
    return new Set(menuDishes.map(md => md.dish_id));
  }, [selectedMenuId, menuDishes]);

  // Group dishes by category
  const { groupedDishes, availableCategories, filteredCount } = useMemo(() => {
    // Filter dishes first
    let filtered = dishes;
    
    // Filter by selected menu
    if (menuDishIds) {
      filtered = filtered.filter(d => menuDishIds.has(d.id));
    }
    
    if (dishSearch) {
      const search = dishSearch.toLowerCase();
      filtered = filtered.filter(d => 
        d.name.toLowerCase().includes(search) ||
        (d.category?.toLowerCase() || "").includes(search)
      );
    }
    if (categoryFilter !== "all") {
      filtered = filtered.filter(d => d.category === categoryFilter);
    }

    // Get unique categories from all dishes (not filtered)
    const allCategories = [...new Set(dishes.map(d => d.category || "Uncategorized"))];
    
    // Group filtered dishes
    const grouped = filtered.reduce((acc, dish) => {
      const cat = dish.category || "Uncategorized";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(dish);
      return acc;
    }, {} as Record<string, Dish[]>);

    // Sort categories by display order
    const sortedCategories = Object.keys(grouped).sort((a, b) => {
      const aIdx = categoryDisplayOrder.findIndex(c => a.toLowerCase().includes(c.toLowerCase()));
      const bIdx = categoryDisplayOrder.findIndex(c => b.toLowerCase().includes(c.toLowerCase()));
      if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });

    return { 
      groupedDishes: sortedCategories.map(cat => ({ category: cat, dishes: grouped[cat] })),
      availableCategories: allCategories.sort(),
      filteredCount: filtered.length
    };
  }, [dishes, dishSearch, categoryFilter, menuDishIds]);

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

  const handleClearDishMapping = (mappingId: string) => {
    updateMapping.mutate({ id: mappingId, internal_id: null, is_verified: false });
  };

  const handleDeleteDishMapping = (mappingId: string) => {
    deleteMapping.mutate(mappingId);
  };

  const handleViewRecipe = (dish: Dish) => {
    setSelectedDish(dish);
    setIsRecipeOpen(true);
  };

  const handleDeleteDish = (dish: Dish) => {
    deleteDish.mutate(dish.id);
  };

  // Session key for remembering expanded state
  const sessionKey = `${selectedLocationId || "all"}`;

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
          
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsMenuUploadOpen(true)}>
              <Upload className="h-4 w-4 mr-2" /> Upload Menu
            </Button>
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
                    autoFocus
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

          <MenuUploadDialog open={isMenuUploadOpen} onOpenChange={setIsMenuUploadOpen} />
        </div>

        <TabsContent value="dishes" className="space-y-4">
          {/* Menu Selector */}
          <MenuSelector
            selectedMenuId={selectedMenuId}
            onMenuSelect={setSelectedMenuId}
          />

          {/* Search & Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search dishes..."
                value={dishSearch}
                onChange={(e) => setDishSearch(e.target.value)}
                className="pl-10"
              />
              {dishSearch && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                  onClick={() => setDishSearch("")}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {availableCategories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={showArchived ? "default" : "outline"}
              size="sm"
              className="h-9"
              onClick={() => setShowArchived(!showArchived)}
            >
              Archived{archivedCount > 0 ? ` (${archivedCount})` : ""}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => setAllExpanded(!allExpanded)}
            >
              {allExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" /> Collapse All
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" /> Expand All
                </>
              )}
            </Button>
            <div className="ml-auto text-sm text-muted-foreground">
              {selectedMenuId 
                ? `${filteredCount} of ${dishes.length} dishes`
                : `${dishes.length} ${dishes.length === 1 ? "dish" : "dishes"} total`}
            </div>
          </div>

          {/* Category Sections */}
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Card key={i}>
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-5 w-5" />
                      <Skeleton className="h-6 w-32" />
                      <Skeleton className="h-5 w-16" />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 pb-4">
                    <div className="space-y-2">
                      {[1, 2, 3].map(j => (
                        <Skeleton key={j} className="h-10 w-full" />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : groupedDishes.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground mb-4">
                  {dishSearch || categoryFilter !== "all" 
                    ? "No dishes match your search criteria"
                    : showArchived
                    ? "No archived dishes."
                    : "No dishes yet. Add your first dish to get started."}
                </p>
                {(dishSearch || categoryFilter !== "all") && (
                  <Button 
                    variant="outline" 
                    onClick={() => { setDishSearch(""); setCategoryFilter("all"); }}
                  >
                    Clear Filters
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {groupedDishes.map(({ category, dishes: categoryDishes }) => (
                <DishCategorySection
                  key={category}
                  category={category}
                  dishes={categoryDishes}
                  defaultExpanded={allExpanded}
                  onEdit={handleEdit}
                  onDelete={handleDeleteDish}
                  onViewRecipe={handleViewRecipe}
                  sessionKey={sessionKey}
                  allDishes={allDishes}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="mapping">
          <Card>
            <CardHeader>
              <CardTitle>Dish POS Mapping</CardTitle>
              <CardDescription>Map Captiva external IDs to your menu dishes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters & Search */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search mappings..."
                    value={mappingSearch}
                    onChange={(e) => setMappingSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Badge 
                    variant={mappingStatusFilter === "all" ? "default" : "outline"} 
                    className="cursor-pointer"
                    onClick={() => setMappingStatusFilter("all")}
                  >
                    All
                  </Badge>
                  <Badge 
                    variant={mappingStatusFilter === "mapped" ? "default" : "outline"} 
                    className="cursor-pointer"
                    onClick={() => setMappingStatusFilter("mapped")}
                  >
                    Mapped
                  </Badge>
                  <Badge 
                    variant={mappingStatusFilter === "unmapped" ? "default" : "outline"} 
                    className="cursor-pointer"
                    onClick={() => setMappingStatusFilter("unmapped")}
                  >
                    Unmapped
                  </Badge>
                  <span className="text-muted-foreground mx-1">|</span>
                  <Badge 
                    variant={showSimOnlyMappings ? "destructive" : "outline"} 
                    className="cursor-pointer"
                    onClick={() => setShowSimOnlyMappings(!showSimOnlyMappings)}
                  >
                    SIM- only {simMappingsCount > 0 && `(${simMappingsCount})`}
                  </Badge>
                </div>
              </div>

              {/* Bulk Actions */}
              {dishMappings.length > 0 && (
                <div className="flex gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Clear All Mappings
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Clear All Dish Mappings?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will delete all {dishMappings.length} dish mappings. Items will need to be remapped.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => dishMappings.forEach(m => deleteMapping.mutate(m.id))}
                          className="bg-destructive text-destructive-foreground"
                        >
                          Clear All
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  {simMappingsCount > 0 && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Clear SIM- Mappings ({simMappingsCount})
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Clear Demo/Simulation Mappings?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will delete {simMappingsCount} mappings with SIM- prefix (demo/simulation data). Live mappings will not be affected.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => dishMappings.filter(m => m.external_id.startsWith("SIM-")).forEach(m => deleteMapping.mutate(m.id))}
                          >
                            Clear SIM- Only
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              )}

              {/* Mapping List */}
              {filteredDishMappings.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  {dishMappings.length === 0 
                    ? "No dishes imported from POS yet. Run a sync first."
                    : "No mappings match your filters."
                  }
                </p>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {filteredDishMappings.map(mapping => {
                    const linkedDish = dishes.find(d => d.id === mapping.internal_id);
                    return (
                      <div key={mapping.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{mapping.external_name || mapping.external_id}</p>
                            {mapping.external_id.startsWith("SIM-") && (
                              <Badge variant="secondary" className="text-xs">SIM</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground font-mono">
                            ID: {mapping.external_id} → {linkedDish?.name || <span className="text-warning">Not mapped</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {mapping.internal_id ? (
                            <Badge variant="default">Mapped</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-warning">
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
                          {mapping.internal_id && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => handleClearDishMapping(mapping.id)}
                              title="Clear mapping"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteDishMapping(mapping.id)}
                            title="Delete mapping"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dish Detail Dialog */}
      <DishDetailDialog dish={selectedDish} open={isRecipeOpen} onOpenChange={setIsRecipeOpen} />
    </PageLayout>
  );
}
