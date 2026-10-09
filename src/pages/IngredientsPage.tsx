import { useState, useMemo, useEffect } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { 
  useIngredients, 
  useCreateIngredient, 
  useUpdateIngredient, 
  useDeleteIngredient, 
  useRestoreIngredient,
  useIngredientDependencies,
  Ingredient, 
  IngredientInsert, 
  UnitType, 
  StorageType,
  PackUnit,
  PurchaseUnit,
  calculateBaseCost,
  getBaseUnit,
  INVENTORY_ITEM_TYPES,
  INVENTORY_ITEM_GROUPS,
  INVENTORY_CATEGORIES,
  itemTypeLabel,
  groupLabel,
  categoryLabel,
  type InventoryItemType
} from "@/hooks/useIngredients";
import { useDishes } from "@/hooks/useDishes";
import { useSuppliers } from "@/hooks/useSuppliers";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { formatCurrency } from "@/lib/currency";
import { usePermissions } from "@/hooks/usePermissions";
import { ImportStockListDialog } from "@/components/inventory/ImportStockListDialog";
import { Upload } from "lucide-react";

const unitOptions: UnitType[] = ["kg", "g", "L", "ml", "oz", "each"];
const storageOptions: StorageType[] = ["freezer", "fridge", "dry"];
const packUnitOptions: PackUnit[] = ["each", "g", "kg", "ml", "L"];
const purchaseUnitOptions: PurchaseUnit[] = ["each", "g", "kg", "ml", "L", "case"];

interface FormData extends IngredientInsert {
  use_pack_pricing: boolean;
}

export default function IngredientsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: allIngredients = [], isLoading } = useIngredients({ includeArchived: true });
  const ingredients = useMemo(
    () => allIngredients.filter((i) => (showArchived ? !!i.archived_at : !i.archived_at)),
    [allIngredients, showArchived]
  );
  const { data: suppliers = [] } = useSuppliers();
  const { data: dishes = [] } = useDishes();
  const createIngredient = useCreateIngredient();
  const updateIngredient = useUpdateIngredient();
  const deleteIngredient = useDeleteIngredient();
  const restoreIngredient = useRestoreIngredient();
  const [pendingDelete, setPendingDelete] = useState<Ingredient | null>(null);
  const { data: deps, isLoading: depsLoading } = useIngredientDependencies(pendingDelete?.id ?? null);
  
  const { hasPermission, hasFullAccess } = usePermissions();
  const canImport = hasFullAccess() || hasPermission("inventory", "edit");
  const [importOpen, setImportOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Ingredient | null>(null);
  const [formData, setFormData] = useState<FormData>({ 
    name: "", 
    unit: "each", 
    storage_type: "dry", 
    item_type: "recipe_ingredient",
    item_group: "food",
    category: "other",
    linked_dish_id: null, 
    default_cost_price: 0,
    use_pack_pricing: false,
    pack_size: null,
    pack_unit: "kg",
    cost_per_pack: null,
    purchase_unit: "each",
    reorder_point: null,
    par_level: null,
    shelf_life_days: null
  });

  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const filteredIngredients = useMemo(() => {
    return ingredients.filter((item) => {
      if (groupFilter !== "all" && item.item_group !== groupFilter) return false;
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (search.trim()) {
        const term = search.toLowerCase();
        return (
          item.name.toLowerCase().includes(term) ||
          itemTypeLabel(item.item_type).toLowerCase().includes(term) ||
          categoryLabel(item.category).toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [ingredients, groupFilter, categoryFilter, search]);

  const availableCategoryOptions = useMemo(
    () => INVENTORY_CATEGORIES.filter((c) => groupFilter === "all" || !c.group || c.group === groupFilter),
    [groupFilter]
  );

  useEffect(() => {
    if (categoryFilter !== "all" && !availableCategoryOptions.some((c) => c.value === categoryFilter)) {
      setCategoryFilter("all");
    }
  }, [availableCategoryOptions, categoryFilter]);

  // Calculate base cost from form data for preview
  const calculatedBaseCost = useMemo(() => {
    if (!formData.use_pack_pricing || !formData.pack_size || !formData.cost_per_pack) {
      return formData.default_cost_price;
    }
    const mockIngredient = {
      pack_size: formData.pack_size,
      pack_unit: formData.pack_unit,
      cost_per_pack: formData.cost_per_pack,
      default_cost_price: formData.default_cost_price
    } as Ingredient;
    return calculateBaseCost(mockIngredient);
  }, [formData.use_pack_pricing, formData.pack_size, formData.pack_unit, formData.cost_per_pack, formData.default_cost_price]);

  const baseUnitLabel = getBaseUnit(formData.pack_unit);

  // Inline editing: same permission as the editor/import; archived view stays read-only.
  const canInline = canImport && !showArchived;
  const saveField = (id: string, patch: Partial<IngredientInsert>) =>
    updateIngredient.mutateAsync({ id, silent: true, ...patch }).then(() => undefined);

  const columns = [
    {
      key: "name", header: "Name",
      render: (item: Ingredient) => (
        <InlineTextCell editable={canInline} label="name" value={item.name} onSave={(v) => saveField(item.id, { name: v })} />
      ),
    },
    {
      key: "item_type",
      header: "Type",
      render: (item: Ingredient) => (
        <InlineSelectCell editable={canInline} label="item type" value={item.item_type ?? "recipe_ingredient"}
          display={<Badge variant="outline">{itemTypeLabel(item.item_type)}</Badge>}
          options={INVENTORY_ITEM_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          onSave={(v) => saveField(item.id, { item_type: v as InventoryItemType })} />
      )
    },
    {
      key: "item_group",
      header: "Group",
      render: (item: Ingredient) => (
        <InlineSelectCell editable={canInline} label="group" value={item.item_group ?? ""}
          display={<Badge variant="secondary" className="capitalize">{groupLabel(item.item_group)}</Badge>}
          options={INVENTORY_ITEM_GROUPS}
          onSave={(v) => {
            // Keep category consistent with the group, as the editor does.
            const cat = INVENTORY_CATEGORIES.find((c) => c.value === item.category);
            const keepCat = !cat || !cat.group || cat.group === v;
            return saveField(item.id, keepCat ? { item_group: v } : { item_group: v, category: null });
          }} />
      )
    },
    {
      key: "category",
      header: "Category",
      render: (item: Ingredient) => (
        <InlineSelectCell editable={canInline} label="category" value={item.category ?? ""}
          display={categoryLabel(item.category)}
          options={INVENTORY_CATEGORIES.filter((c) => !item.item_group || !c.group || c.group === item.item_group)}
          onSave={(v) => saveField(item.id, { category: v })} />
      )
    },
    {
      key: "unit", header: "Unit",
      render: (item: Ingredient) => (
        <UnitCell item={item} editable={canInline} onSave={(u) => saveField(item.id, { unit: u })} />
      ),
    },
    { 
      key: "storage_type", 
      header: "Storage",
      render: (item: Ingredient) => (
        <InlineSelectCell editable={canInline} label="storage" value={item.storage_type}
          display={<Badge variant="secondary" className="capitalize">{item.storage_type}</Badge>}
          options={storageOptions.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))}
          onSave={(v) => saveField(item.id, { storage_type: v as StorageType })} />
      )
    },
    { 
      key: "suppliers", 
      header: "Supplier",
      render: (item: Ingredient) => (
        <InlineSelectCell editable={canInline} label="supplier" value={item.supplier_id ?? "_none"}
          display={item.suppliers?.name || "-"}
          options={[{ value: "_none", label: "No supplier" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
          onSave={(v) => saveField(item.id, { supplier_id: v === "_none" ? null : v })} />
      )
    },
    { 
      key: "pack_info", 
      header: "Pack Size",
      render: (item: Ingredient) => (
        <PackSizeCell item={item} editable={canInline} onSave={(patch) => saveField(item.id, patch)} />
      )
    },
    { 
      key: "base_cost", 
      header: "Base Cost",
      render: (item: Ingredient) => {
        const baseCost = calculateBaseCost(item);
        if (!(baseCost > 0)) return <span className="text-warning">Missing cost</span>;
        const unit = item.pack_size && item.cost_per_pack ? getBaseUnit(item.pack_unit) : item.unit;
        return (
          <div className="whitespace-nowrap">
            {formatUnitCost(baseCost)}/{unit}
            {(unit === "g" || unit === "ml") && (
              <div className="text-xs text-muted-foreground">{formatCurrency(baseCost * 1000)}/{unit === "g" ? "kg" : "L"}</div>
            )}
          </div>
        );
      }
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prepare data - if not using pack pricing, set base cost as default
    const submitData: IngredientInsert = {
      name: formData.name,
      unit: formData.unit,
      storage_type: formData.storage_type,
      item_type: formData.item_type,
      item_group: formData.item_group ?? null,
      category: formData.category ?? null,
      linked_dish_id: formData.item_type === "direct_sale" ? formData.linked_dish_id ?? null : null,
      supplier_id: formData.supplier_id,
      default_cost_price: formData.use_pack_pricing ? calculatedBaseCost : formData.default_cost_price,
      pack_size: formData.use_pack_pricing ? formData.pack_size : null,
      pack_unit: formData.use_pack_pricing ? formData.pack_unit : null,
      cost_per_pack: formData.use_pack_pricing ? formData.cost_per_pack : null,
      purchase_unit: formData.purchase_unit,
      reorder_point: formData.reorder_point ?? null,
      par_level: formData.par_level ?? null,
      shelf_life_days: formData.shelf_life_days ?? null
    };
    
    if (editingItem) {
      await updateIngredient.mutateAsync({ id: editingItem.id, ...submitData });
    } else {
      await createIngredient.mutateAsync(submitData);
    }
    handleClose();
  };

  const handleEdit = (item: Ingredient) => {
    setEditingItem(item);
    const hasPackPricing = Boolean(item.pack_size && item.cost_per_pack);
    setFormData({ 
      name: item.name, 
      unit: item.unit, 
      storage_type: item.storage_type,
      item_type: (item.item_type as InventoryItemType) || "recipe_ingredient",
      item_group: item.item_group ?? "food",
      category: item.category ?? "other",
      linked_dish_id: item.linked_dish_id ?? null,
      supplier_id: item.supplier_id,
      default_cost_price: Number(item.default_cost_price),
      use_pack_pricing: hasPackPricing,
      pack_size: item.pack_size ? Number(item.pack_size) : null,
      pack_unit: (item.pack_unit as PackUnit) || "kg",
      cost_per_pack: item.cost_per_pack ? Number(item.cost_per_pack) : null,
      purchase_unit: (item.purchase_unit as PurchaseUnit) || "each",
      reorder_point: item.reorder_point !== null && item.reorder_point !== undefined ? Number(item.reorder_point) : null,
      par_level: item.par_level !== null && item.par_level !== undefined ? Number(item.par_level) : null,
      shelf_life_days: item.shelf_life_days ?? null
    });
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setEditingItem(null);
    setFormData({ 
      name: "", 
      unit: "each", 
      storage_type: "dry", 
      item_type: "recipe_ingredient",
      item_group: "food",
      category: "other",
      linked_dish_id: null, 
      default_cost_price: 0,
      use_pack_pricing: false,
      pack_size: null,
      pack_unit: "kg",
      cost_per_pack: null,
      purchase_unit: "each",
      reorder_point: null,
      par_level: null,
      shelf_life_days: null
    });
  };

  const packSizeError = formData.use_pack_pricing && formData.pack_size !== null && formData.pack_size <= 0;
  const costError = formData.use_pack_pricing && formData.cost_per_pack !== null && formData.cost_per_pack < 0;

  return (
    <PageLayout title="Inventory Items" subtitle="Manage the ingredients, products and supplies used by your restaurant.">
      <div className="flex flex-wrap justify-end gap-2 mb-4">
        {canImport && (
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-2" /> Import Stock List
            </Button>
            <ImportStockListDialog open={importOpen} onOpenChange={setImportOpen} />
          </>
        )}
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Inventory Item
            </Button>
          </DialogTrigger>
          <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-lg flex-col gap-4 overflow-hidden p-6">
            <DialogHeader className="shrink-0 pr-10">
              <DialogTitle>{editingItem ? "Edit Inventory Item" : "Add Inventory Item"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-2 pr-1 touch-pan-y [-webkit-overflow-scrolling:touch]">
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
                <Label>Item type</Label>
                <Select
                  value={formData.item_type || "recipe_ingredient"}
                  onValueChange={(v: InventoryItemType) => setFormData({ ...formData, item_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVENTORY_ITEM_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {INVENTORY_ITEM_TYPES.find((t) => t.value === (formData.item_type || "recipe_ingredient"))?.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Group</Label>
                  <Select value={formData.item_group || "food"} onValueChange={(v) => setFormData({ ...formData, item_group: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVENTORY_ITEM_GROUPS.map((g) => (
                        <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={formData.category || "other"} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVENTORY_CATEGORIES.filter((c) => !c.group || c.group === formData.item_group).map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formData.item_type === "direct_sale" && (
                <div>
                  <Label>Linked sale product (optional)</Label>
                  <Select
                    value={formData.linked_dish_id || "_none"}
                    onValueChange={(v) => setFormData({ ...formData, linked_dish_id: v === "_none" ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="_none">Not linked</SelectItem>
                      {dishes.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Link the POS product so 1 unit sold counts as 1 unit consumed — no fake recipe needed.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Recipe Unit</Label>
                  <Select value={formData.unit} onValueChange={(v: UnitType) => setFormData({ ...formData, unit: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {unitOptions.map((unit) => (
                        <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Storage Type</Label>
                  <Select value={formData.storage_type} onValueChange={(v: StorageType) => setFormData({ ...formData, storage_type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {storageOptions.map((type) => (
                        <SelectItem key={type} value={type} className="capitalize">{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Supplier (optional)</Label>
                <SupplierSelect
                  value={formData.supplier_id || "_none"}
                  onValueChange={(v) => setFormData({ ...formData, supplier_id: v === "_none" ? null : v })}
                  noneOption={{ value: "_none", label: "None" }}
                />
              </div>

              {/* Pack Pricing Toggle */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="use_pack_pricing"
                  checked={formData.use_pack_pricing}
                  onChange={(e) => setFormData({ ...formData, use_pack_pricing: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="use_pack_pricing" className="text-sm font-normal cursor-pointer">
                  Use pack pricing (recommended)
                </Label>
              </div>

              {formData.use_pack_pricing ? (
                <>
                  {/* Pack Size & Unit */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="pack_size">Pack Size</Label>
                      <Input
                        id="pack_size"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={formData.pack_size ?? ""}
                        onChange={(e) => setFormData({ ...formData, pack_size: e.target.value ? parseFloat(e.target.value) : null })}
                        placeholder="e.g. 2"
                        className={packSizeError ? "border-destructive" : ""}
                      />
                      {packSizeError && (
                        <p className="text-xs text-destructive mt-1">Pack size must be greater than 0</p>
                      )}
                    </div>
                    <div>
                      <Label>Pack Unit</Label>
                      <Select value={formData.pack_unit || "kg"} onValueChange={(v: PackUnit) => setFormData({ ...formData, pack_unit: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {packUnitOptions.map((unit) => (
                            <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Cost per Pack */}
                  <div>
                    <Label htmlFor="cost_per_pack">Cost per Pack (€)</Label>
                    <Input
                      id="cost_per_pack"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.cost_per_pack ?? ""}
                      onChange={(e) => setFormData({ ...formData, cost_per_pack: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="e.g. 20.00"
                      className={costError ? "border-destructive" : ""}
                    />
                    {costError && (
                      <p className="text-xs text-destructive mt-1">Cost must be 0 or greater</p>
                    )}
                  </div>

                  {/* Calculated Base Cost Display */}
                  {formData.pack_size && formData.pack_size > 0 && formData.cost_per_pack !== null && formData.cost_per_pack >= 0 && (
                    <div className="bg-muted/50 border border-border rounded-md px-3 py-2">
                      <p className="text-sm text-muted-foreground">
                        Calculated cost: <span className="font-medium text-foreground">{formatCurrency(calculatedBaseCost)} per {baseUnitLabel}</span>
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <Label htmlFor="price">Cost per Unit (€)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.default_cost_price}
                    onChange={(e) => setFormData({ ...formData, default_cost_price: parseFloat(e.target.value) || 0 })}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">Direct cost per {formData.unit}</p>
                </div>
              )}

              <div className="rounded-md border p-3 space-y-3">
                <div>
                  <p className="text-sm font-medium">Stock thresholds (optional)</p>
                  <p className="text-xs text-muted-foreground">
                    Low and Critical alerts, reorder suggestions and wastage risk only appear for
                    items where these are set.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="reorder_point">Reorder point ({formData.unit})</Label>
                    <Input
                      id="reorder_point"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Not set"
                      value={formData.reorder_point ?? ""}
                      onChange={(e) => setFormData({ ...formData, reorder_point: e.target.value ? parseFloat(e.target.value) : null })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="par_level">Par level ({formData.unit})</Label>
                    <Input
                      id="par_level"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Not set"
                      value={formData.par_level ?? ""}
                      onChange={(e) => setFormData({ ...formData, par_level: e.target.value ? parseFloat(e.target.value) : null })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="shelf_life_days">Shelf life (days)</Label>
                  <Input
                    id="shelf_life_days"
                    type="number"
                    step="1"
                    min="0"
                    placeholder="Not set"
                    value={formData.shelf_life_days ?? ""}
                    onChange={(e) => setFormData({ ...formData, shelf_life_days: e.target.value ? parseInt(e.target.value, 10) : null })}
                  />
                </div>
              </div>

              </div>
              <div className="flex shrink-0 justify-end gap-2 border-t bg-background pt-4 pb-1">
                <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                <Button 
                  type="submit" 
                  disabled={createIngredient.isPending || updateIngredient.isPending || packSizeError || costError}
                >
                  {editingItem ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          placeholder="Search items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs min-h-[44px]"
        />
        <Select value={groupFilter} onValueChange={(v) => setGroupFilter(v)}>
          <SelectTrigger className="w-full sm:w-[160px] min-h-[44px]">
            <SelectValue placeholder="All groups" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All groups</SelectItem>
            {INVENTORY_ITEM_GROUPS.map((g) => (
              <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v)}>
          <SelectTrigger className="w-full sm:w-[180px] min-h-[44px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {availableCategoryOptions.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={showArchived ? "secondary" : "outline"}
          className="min-h-[44px]"
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? "Show active" : "Show archived"}
        </Button>
      </div>

      <DataTable
        data={filteredIngredients}
        columns={columns}
        isLoading={isLoading}
        onEdit={showArchived ? (item) => restoreIngredient.mutate(item.id) : handleEdit}
        onDelete={showArchived ? undefined : (item) => setPendingDelete(item)}
      />
      {showArchived && (
        <p className="text-sm text-muted-foreground mt-2">
          Archived items are hidden from lists and selectors but still used for past reports and costs. Use the edit button to restore one.
        </p>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {depsLoading || !deps
                ? "Checking item…"
                : deps.can_delete
                  ? `Permanently delete "${pendingDelete?.name}"?`
                  : `Archive "${pendingDelete?.name}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {deps && deps.can_delete && (
                  <p>This item has never been used. It will be removed permanently.</p>
                )}
                {deps && !deps.can_delete && (
                  <>
                    <p>This item has history, so it will be archived instead of deleted:</p>
                    <ul className="list-disc pl-5">
                      {deps.recipe_lines > 0 && <li>Used in {deps.recipe_lines} recipe line(s)</li>}
                      {deps.linked_dish > 0 && <li>Linked to a dish</li>}
                      {deps.purchase_lines > 0 && <li>{deps.purchase_lines} purchase order line(s)</li>}
                      {deps.adjustments > 0 && <li>{deps.adjustments} stock adjustment(s)</li>}
                      {deps.count_lines > 0 && <li>{deps.count_lines} stock count line(s)</li>}
                      {deps.stock_on_hand > 0 && <li>Stock on hand</li>}
                      {deps.price_entries > 1 && <li>{deps.price_entries} price history entries</li>}
                    </ul>
                    <p>It will disappear from active lists and selectors. Past reports and dish costs stay exactly the same, and you can restore it later.</p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!deps || deleteIngredient.isPending}
              onClick={() => {
                if (pendingDelete) deleteIngredient.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              {deps?.can_delete ? "Delete permanently" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}
