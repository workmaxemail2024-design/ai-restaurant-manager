import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Plus, CheckCircle2, AlertTriangle, Package, Link2, Utensils, Search
} from "lucide-react";
import { useDishes, useCreateDish } from "@/hooks/useDishes";
import { useUnmappedPOSItems, useCreatePOSMapping, useUpdatePOSMapping, usePOSMappings, type UnmappedPOSItem } from "@/hooks/usePOS";
import { formatCurrency } from "@/lib/currency";

interface POSDishMappingTabProps {
  locationId: string;
  posProvider: string;
  restaurantId: string;
}

export function POSDishMappingTab({ locationId, posProvider, restaurantId }: POSDishMappingTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
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
  const createDish = useCreateDish();

  // Filter by search
  const filteredUnmapped = unmappedItems?.filter(item => 
    item.item_name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // Get dish mappings (type = "dish")
  const dishMappings = mappings?.filter(m => m.mapping_type === "dish") || [];

  const handleMapToDish = async (item: UnmappedPOSItem, dishId: string) => {
    await createMapping.mutateAsync({
      location_id: locationId,
      restaurant_id: restaurantId,
      pos_provider: posProvider,
      mapping_type: "dish",
      external_id: item.item_name, // Using item name as the external_id for matching
      external_name: item.item_name,
      internal_id: dishId,
      is_verified: true,
    });
  };

  const handleCreateAndMapDish = async () => {
    if (!selectedItem || !newDishName.trim()) return;

    // Create the new dish (without restaurant_id - the DB will use RLS context)
    const newDish = await createDish.mutateAsync({
      name: newDishName.trim(),
      selling_price: parseFloat(newDishPrice) || selectedItem.avg_price,
      category: newDishCategory.trim() || null,
      location_id: locationId,
    });

    // Create the mapping
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

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <p className="text-sm text-muted-foreground">Unmapped Items</p>
            </div>
            <p className="text-2xl font-bold mt-1">{unmappedItems?.length || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              <p className="text-sm text-muted-foreground">Mapped Items</p>
            </div>
            <p className="text-2xl font-bold mt-1">{dishMappings.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-secondary-foreground" />
              <p className="text-sm text-muted-foreground">Unmapped Revenue</p>
            </div>
            <p className="text-2xl font-bold mt-1">
              {formatCurrency(unmappedItems?.reduce((sum, i) => sum + i.total_revenue, 0) || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Unmapped Items Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Unmapped POS Items
          </CardTitle>
          <CardDescription>
            Map POS items to system dishes to track sales per dish. Many POS items can map to one dish.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search unmapped items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredUnmapped.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-primary" />
              <p>All POS items are mapped!</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {filteredUnmapped.map((item) => (
                <div
                  key={item.item_name}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-medium">{item.item_name}</p>
                    <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                      <span>{item.sale_count} sales</span>
                      <span>{item.total_quantity} qty</span>
                      <span>{formatCurrency(item.total_revenue)} revenue</span>
                      <span>Avg: {formatCurrency(item.avg_price)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select onValueChange={(dishId) => handleMapToDish(item, dishId)}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Map to dish..." />
                      </SelectTrigger>
                      <SelectContent>
                        {dishes?.map((dish) => (
                          <SelectItem key={dish.id} value={dish.id}>
                            {dish.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openCreateDishModal(item)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      New Dish
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Existing Mappings Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Current Dish Mappings
          </CardTitle>
          <CardDescription>
            Mapped POS items will appear in dashboard reports under their linked dish.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dishMappings.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No dish mappings yet. Map items above to see them here.
            </p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {dishMappings.map((mapping) => {
                const linkedDish = dishes?.find(d => d.id === mapping.internal_id);
                return (
                  <div
                    key={mapping.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Utensils className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{mapping.external_name || mapping.external_id}</p>
                        <p className="text-sm text-muted-foreground">
                          → {linkedDish?.name || "Unknown dish"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {mapping.is_verified ? (
                        <Badge variant="default">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Verified
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                      <Select
                        value={mapping.internal_id || ""}
                        onValueChange={(v) =>
                          updateMapping.mutate({ id: mapping.id, internal_id: v, is_verified: true })
                        }
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Change dish" />
                        </SelectTrigger>
                        <SelectContent>
                          {dishes?.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dish Modal */}
      <Dialog open={createDishModalOpen} onOpenChange={setCreateDishModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Dish & Map</DialogTitle>
            <DialogDescription>
              Create a new dish and automatically map "{selectedItem?.item_name}" to it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Dish Name</Label>
              <Input
                value={newDishName}
                onChange={(e) => setNewDishName(e.target.value)}
                placeholder="Enter dish name"
              />
            </div>
            <div>
              <Label>Selling Price</Label>
              <Input
                type="number"
                step="0.01"
                value={newDishPrice}
                onChange={(e) => setNewDishPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Category (optional)</Label>
              <Input
                value={newDishCategory}
                onChange={(e) => setNewDishCategory(e.target.value)}
                placeholder="e.g., Main Course, Drinks"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDishModalOpen(false)}>
              Cancel
            </Button>
            <Button
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
