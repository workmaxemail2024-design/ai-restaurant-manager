import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ChevronRight, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { usePurchaseOrders, useCreatePurchaseOrder, useUpdatePurchaseOrderStatus, useDeletePurchaseOrder, usePurchaseOrderItems, useAddPurchaseOrderItem, PurchaseOrder, PurchaseOrderInsert } from "@/hooks/usePurchaseOrders";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useLocations } from "@/hooks/useLocations";
import { useIngredients } from "@/hooks/useIngredients";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";

export default function PurchaseOrdersPage() {
  const { data: orders = [], isLoading } = usePurchaseOrders();
  const { data: suppliers = [] } = useSuppliers();
  const { data: locations = [] } = useLocations();
  const { data: ingredients = [] } = useIngredients();
  const createOrder = useCreatePurchaseOrder();
  const updateStatus = useUpdatePurchaseOrderStatus();
  const deleteOrder = useDeletePurchaseOrder();
  const addItem = useAddPurchaseOrderItem();
  
  const [isOpen, setIsOpen] = useState(false);
  const [isItemsOpen, setIsItemsOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [formData, setFormData] = useState<PurchaseOrderInsert>({ supplier_id: "", location_id: "" });
  const [itemForm, setItemForm] = useState({ ingredient_id: "", quantity: 0, cost_price: 0 });
  
  const { data: orderItems = [] } = usePurchaseOrderItems(selectedOrder?.id || null);

  const statusColors: Record<string, string> = {
    pending: "bg-warning/20 text-warning",
    completed: "bg-success/20 text-success",
    cancelled: "bg-destructive/20 text-destructive",
  };

  const columns = [
    { 
      key: "order_date", 
      header: "Date",
      render: (item: PurchaseOrder) => new Date(item.order_date).toLocaleDateString()
    },
    { key: "suppliers", header: "Supplier", render: (item: PurchaseOrder) => item.suppliers?.name || "-" },
    { key: "locations", header: "Location", render: (item: PurchaseOrder) => item.locations?.name || "-" },
    { 
      key: "total", 
      header: "Total",
      render: (item: PurchaseOrder) => formatCurrency(Number(item.total || 0))
    },
    { 
      key: "status", 
      header: "Status",
      render: (item: PurchaseOrder) => (
        <Badge className={cn("capitalize", statusColors[item.status] || "")}>
          {item.status}
        </Badge>
      )
    },
    {
      key: "items",
      header: "Items",
      render: (item: PurchaseOrder) => (
        <Button variant="ghost" size="sm" onClick={() => { setSelectedOrder(item); setIsItemsOpen(true); }}>
          View <ChevronRight className="h-4 w-4" />
        </Button>
      )
    },
    {
      key: "actions",
      header: "",
      render: (item: PurchaseOrder) => item.status === "pending" && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => updateStatus.mutate({ id: item.id, status: "completed" })}
        >
          <Check className="h-4 w-4 mr-1" /> Complete
        </Button>
      )
    }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newOrder = await createOrder.mutateAsync(formData);
    setSelectedOrder(newOrder as PurchaseOrder);
    handleClose();
    setIsItemsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setFormData({ supplier_id: "", location_id: "" });
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOrder) {
      await addItem.mutateAsync({ purchase_order_id: selectedOrder.id, ...itemForm });
      setItemForm({ ingredient_id: "", quantity: 0, cost_price: 0 });
    }
  };

  return (
    <PageLayout title="Purchase Orders" subtitle="Manage purchase orders and restock inventory">
      <div className="flex justify-end mb-4">
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> New Order
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Purchase Order</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Supplier</Label>
                <Select value={formData.supplier_id} onValueChange={(v) => setFormData({ ...formData, supplier_id: v })} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((sup) => (
                      <SelectItem key={sup.id} value={sup.id}>{sup.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Location</Label>
                <Select value={formData.location_id} onValueChange={(v) => setFormData({ ...formData, location_id: v })} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                <Button type="submit" disabled={createOrder.isPending || !formData.supplier_id || !formData.location_id}>
                  Create & Add Items
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable
        data={orders}
        columns={columns}
        isLoading={isLoading}
        onDelete={(item) => item.status === "pending" && deleteOrder.mutate(item.id)}
      />

      {/* Order Items Dialog */}
      <Dialog open={isItemsOpen} onOpenChange={setIsItemsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Order Items - {selectedOrder?.suppliers?.name} ({new Date(selectedOrder?.order_date || "").toLocaleDateString()})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedOrder?.status === "pending" && (
              <form onSubmit={handleAddItem} className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label>Ingredient</Label>
                  <Select value={itemForm.ingredient_id} onValueChange={(v) => {
                    const ing = ingredients.find(i => i.id === v);
                    setItemForm({ ...itemForm, ingredient_id: v, cost_price: ing ? Number(ing.default_cost_price) : 0 });
                  }}>
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
                <div className="w-24">
                  <Label>Qty</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={itemForm.quantity}
                    onChange={(e) => setItemForm({ ...itemForm, quantity: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="w-24">
                  <Label>Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={itemForm.cost_price}
                    onChange={(e) => setItemForm({ ...itemForm, cost_price: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <Button type="submit" disabled={addItem.isPending || !itemForm.ingredient_id}>
                  Add
                </Button>
              </form>
            )}
            <div className="border border-border rounded-lg divide-y divide-border">
              {orderItems.length === 0 ? (
                <p className="p-4 text-muted-foreground text-center">No items added yet</p>
              ) : (
                orderItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3">
                    <span>{item.ingredients?.name}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">{Number(item.quantity).toFixed(2)} {item.ingredients?.unit}</span>
                      <span className="font-medium">{formatCurrency(Number(item.quantity) * Number(item.cost_price))}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end text-lg font-semibold">
              Total: {formatCurrency(orderItems.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.cost_price)), 0))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
