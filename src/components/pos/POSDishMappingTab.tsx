import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Plus, CheckCircle2, AlertTriangle, Package, Link2, Utensils, Search, X, Trash2, Filter
} from "lucide-react";
import { useDishes, useCreateDish } from "@/hooks/useDishes";
import { useUnmappedPOSItems, useCreatePOSMapping, useUpdatePOSMapping, useDeletePOSMapping, useBulkDeletePOSMappings, usePOSMappings, type UnmappedPOSItem } from "@/hooks/usePOS";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface POSDishMappingTabProps {
  locationId: string;
  posProvider: string;
  restaurantId: string;
}

type StatusFilter = "all" | "mapped" | "unmapped";
type ProviderFilter = "all" | "captiva" | "simulation";

export function POSDishMappingTab({ locationId, posProvider, restaurantId }: POSDishMappingTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [showSimOnly, setShowSimOnly] = useState(false);
  const [createDishModalOpen, setCreateDishModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<UnmappedPOSItem | null>(null);
  const [newDishName, setNewDishName] = useState("");
  const [newDishPrice, setNewDishPrice] = useState("");
  const [newDishCategory, setNewDishCategory] = useState("");

  const { data: unmappedItems, isLoading: unmappedLoading } = useUnmappedPOSItems(locationId, posProvider);
  const { data: mappings, isLoading: mappingsLoading } = usePOSMappings(locationId, posProvider);
  const { data: dishes } = useDishes();
  
  const createMapping = useCreatePOSMapping();
  const updateMapping = useUpdatePOSMapping();
  const deleteMapping = useDeletePOSMapping();
  const bulkDeleteMappings = useBulkDeletePOSMappings();
  const createDish = useCreateDish();

  // Get dish mappings (type = "dish")
  const dishMappings = mappings?.filter(m => m.mapping_type === "dish") || [];

  // Filter mappings by search, provider, status, and SIM prefix
  const filteredMappings = dishMappings.filter(mapping => {
    const matchesSearch = searchQuery === "" || 
      (mapping.external_name || mapping.external_id).toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesProvider = providerFilter === "all" || 
      (providerFilter === "simulation" ? mapping.pos_provider === "simulation" : mapping.pos_provider !== "simulation");
    
    const matchesStatus = statusFilter === "all" ||
      (statusFilter === "mapped" ? mapping.internal_id !== null : mapping.internal_id === null);
    
    const matchesSim = !showSimOnly || mapping.external_id.startsWith("SIM-");
    
    return matchesSearch && matchesProvider && matchesStatus && matchesSim;
  });

  // Filter unmapped items by search and SIM prefix
  const filteredUnmapped = unmappedItems?.filter(item => {
    const matchesSearch = item.item_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSim = !showSimOnly || item.item_name.startsWith("SIM-");
    return matchesSearch && matchesSim;
  }) || [];

  const handleMapToDish = async (item: UnmappedPOSItem, dishId: string) => {
    await createMapping.mutateAsync({
      location_id: locationId,
      restaurant_id: restaurantId,
      pos_provider: posProvider,
      mapping_type: "dish",
      external_id: item.item_name,
      external_name: item.item_name,
      internal_id: dishId,
      is_verified: true,
    });
  };

  const handleClearMapping = (mappingId: string) => {
    updateMapping.mutate({ id: mappingId, internal_id: null, is_verified: false });
  };

  const handleDeleteMapping = (mappingId: string) => {
    deleteMapping.mutate(mappingId);
  };

  const handleClearAllMappings = () => {
    bulkDeleteMappings.mutate({ 
      locationId, 
      posProvider, 
      mappingType: "dish" 
    });
  };

  const handleClearSimMappings = () => {
    bulkDeleteMappings.mutate({ 
      locationId, 
      posProvider, 
      mappingType: "dish",
      simOnly: true 
    });
  };

  const handleCreateAndMapDish = async () => {
    if (!selectedItem || !newDishName.trim()) return;

    const newDish = await createDish.mutateAsync({
      name: newDishName.trim(),
      selling_price: parseFloat(newDishPrice) || selectedItem.avg_price,
      category: newDishCategory.trim() || null,
      location_id: locationId,
    });

    await createMapping.mutateAsync({
      location_id: locationId,
      restaurant_id: restaurantId,
      pos_provider: posProvider,
      mapping_type: "dish",
      external_id: selectedItem.item_name,
      external_name: selectedItem.item_name,
      internal_id: newDish.id,
      is_verified: true,
    });

    setCreateDishModalOpen(false);
    setSelectedItem(null);
    setNewDishName("");
    setNewDishPrice("");
    setNewDishCategory("");
  };

  const openCreateDishModal = (item: UnmappedPOSItem) => {
    setSelectedItem(item);
    setNewDishName(item.item_name);
    setNewDishPrice(item.avg_price.toFixed(2));
    setNewDishCategory("");
    setCreateDishModalOpen(true);
  };

  const isLoading = unmappedLoading || mappingsLoading;

  const simMappingsCount = dishMappings.filter(m => m.external_id.startsWith("SIM-")).length;

  return (
    <div className="space-y-3">
      {/* Summary Cards - Compact */}
      <div className="grid gap-2 md:grid-cols-3">
        <Card>
          <CardContent className="py-2.5 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                <span className="text-[11px] text-muted-foreground">Unmapped</span>
              </div>
              <span className="text-lg font-bold">{unmappedItems?.length || 0}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2.5 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] text-muted-foreground">Mapped</span>
              </div>
              <span className="text-lg font-bold">{dishMappings.filter(m => m.internal_id).length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2.5 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">Unmapped Rev</span>
              </div>
              <span className="text-lg font-bold">{formatCurrency(unmappedItems?.reduce((sum, i) => sum + i.total_revenue, 0) || 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card>
        <CardContent className="py-2.5 px-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 h-7 text-xs"
              />
            </div>
            <div className="flex items-center gap-1">
              <Filter className="h-3 w-3 text-muted-foreground" />
              {(["all", "mapped", "unmapped"] as const).map(status => (
                <Badge 
                  key={status}
                  variant={statusFilter === status ? "default" : "outline"} 
                  className="cursor-pointer text-[10px] h-5 px-1.5"
                  onClick={() => setStatusFilter(status)}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Badge>
              ))}
              {simMappingsCount > 0 && (
                <>
                  <span className="text-muted-foreground/50 mx-0.5">|</span>
                  <Badge 
                    variant={showSimOnly ? "destructive" : "outline"} 
                    className="cursor-pointer text-[10px] h-5 px-1.5"
                    onClick={() => setShowSimOnly(!showSimOnly)}
                  >
                    SIM ({simMappingsCount})
                  </Badge>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {dishMappings.length > 0 && (
        <div className="flex gap-1.5">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-[11px]" disabled={bulkDeleteMappings.isPending}>
                <Trash2 className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-sm">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-base">Clear All Dish Mappings?</AlertDialogTitle>
                <AlertDialogDescription className="text-sm">
                  Delete {dishMappings.length} mappings. Items need remapping.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-8">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearAllMappings} className="h-8 bg-destructive text-destructive-foreground">
                  Clear
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {simMappingsCount > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-[11px]" disabled={bulkDeleteMappings.isPending}>
                  <Trash2 className="h-3 w-3 mr-1" />
                  SIM ({simMappingsCount})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-sm">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-base">Clear Demo Mappings?</AlertDialogTitle>
                  <AlertDialogDescription className="text-sm">
                    Delete {simMappingsCount} simulation mappings.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="h-8">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearSimMappings} className="h-8">
                    Clear SIM
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      {/* Unmapped Items Section */}
      {(statusFilter === "all" || statusFilter === "unmapped") && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              Unmapped Items
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-3 pb-3">
            {isLoading ? (
              <div className="space-y-1.5">
                {[1, 2].map(i => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : filteredUnmapped.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <CheckCircle2 className="h-6 w-6 mx-auto mb-1.5 text-primary" />
                <p className="text-xs">All mapped!</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-[240px] overflow-y-auto">
                {filteredUnmapped.map((item) => (
                  <div
                    key={item.item_name}
                    className="flex items-center justify-between p-2 border rounded hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-xs truncate">{item.item_name}</p>
                        {item.item_name.startsWith("SIM-") && (
                          <Badge variant="secondary" className="text-[9px] h-4 px-1">SIM</Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {item.sale_count} sales · {formatCurrency(item.total_revenue)} · Avg {formatCurrency(item.avg_price)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Select onValueChange={(dishId) => handleMapToDish(item, dishId)}>
                        <SelectTrigger className="w-28 h-7 text-[11px]">
                          <SelectValue placeholder="Map..." />
                        </SelectTrigger>
                        <SelectContent>
                          {dishes?.map((dish) => (
                            <SelectItem key={dish.id} value={dish.id} className="text-xs">
                              {dish.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => openCreateDishModal(item)}
                        title="Create dish from POS item"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Existing Mappings Section */}
      {(statusFilter === "all" || statusFilter === "mapped") && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
              <Link2 className="h-3.5 w-3.5 text-primary" />
              Mapped Dishes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-3 pb-3">
            {filteredMappings.length === 0 ? (
              <p className="text-muted-foreground text-center py-3 text-xs">
                No mappings yet
              </p>
            ) : (
              <div className="space-y-1 max-h-[240px] overflow-y-auto">
                {filteredMappings.map((mapping) => {
                  const linkedDish = dishes?.find(d => d.id === mapping.internal_id);
                  return (
                    <div
                      key={mapping.id}
                      className="flex items-center justify-between p-2 border rounded hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <Utensils className="h-3 w-3 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="font-medium text-xs truncate">{mapping.external_name || mapping.external_id}</p>
                            {mapping.external_id.startsWith("SIM-") && (
                              <Badge variant="secondary" className="text-[9px] h-4 px-1">SIM</Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">
                            → {linkedDish?.name || <span className="text-warning">Unmapped</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Select
                          value={mapping.internal_id || ""}
                          onValueChange={(v) =>
                            updateMapping.mutate({ id: mapping.id, internal_id: v, is_verified: true })
                          }
                        >
                          <SelectTrigger className="w-28 h-6 text-[10px]">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {dishes?.map((d) => (
                              <SelectItem key={d.id} value={d.id} className="text-xs">
                                {d.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {mapping.internal_id && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 hover:bg-secondary"
                            onClick={() => handleClearMapping(mapping.id)}
                            title="Clear"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteMapping(mapping.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create Dish Modal */}
      <Dialog open={createDishModalOpen} onOpenChange={setCreateDishModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create & Map Dish</DialogTitle>
            <DialogDescription className="text-xs">
              Create a new dish and map "{selectedItem?.item_name}" to it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Dish Name</Label>
              <Input
                className="h-9"
                value={newDishName}
                onChange={(e) => setNewDishName(e.target.value)}
                placeholder="Enter dish name"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Selling Price</Label>
              <Input
                className="h-9"
                type="number"
                step="0.01"
                value={newDishPrice}
                onChange={(e) => setNewDishPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Category (optional)</Label>
              <Input
                className="h-9"
                value={newDishCategory}
                onChange={(e) => setNewDishCategory(e.target.value)}
                placeholder="e.g., Main, Drinks"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreateDishModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateAndMapDish}
              disabled={!newDishName.trim() || createDish.isPending || createMapping.isPending}
            >
              {createDish.isPending || createMapping.isPending ? "Creating..." : "Create & Map"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
