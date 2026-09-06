import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ChevronRight, Check, Package, Pencil, Trash2, Save, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { usePurchaseOrders, useCreatePurchaseOrder, useUpdatePurchaseOrderStatus, useDeletePurchaseOrder, usePurchaseOrderItems, useAddPurchaseOrderItem, useAddPurchaseOrderItems, useReceiveDelivery, useUpdatePurchaseOrder, useUpdatePurchaseOrderItem, useDeletePurchaseOrderItem, canEditPurchaseOrder, canEditPurchaseOrderHeader, PurchaseOrder, PurchaseOrderItem, PurchaseOrderInsert } from "@/hooks/usePurchaseOrders";
import { useSuppliers } from "@/hooks/useSuppliers";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { useLocations } from "@/hooks/useLocations";
import { useIngredients } from "@/hooks/useIngredients";
import { useLocation } from "@/contexts/LocationContext";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { POInvoiceSection } from "@/components/purchase-orders/POInvoiceSection";
import { ReceiveDeliveryModal } from "@/components/purchase-orders/ReceiveDeliveryModal";
import { InventoryItemSelect } from "@/components/inventory/InventoryItemSelect";


export default function PurchaseOrdersPage() {
  const { selectedLocationId } = useLocation();
  const { data: orders = [], isLoading } = usePurchaseOrders(selectedLocationId);
  const { data: suppliers = [] } = useSuppliers();
  const { data: locations = [] } = useLocations();
  const { data: ingredients = [] } = useIngredients();
  const createOrder = useCreatePurchaseOrder();
  const updateStatus = useUpdatePurchaseOrderStatus();
  const deleteOrder = useDeletePurchaseOrder();
  const addItem = useAddPurchaseOrderItem();
  const addItems = useAddPurchaseOrderItems();
  const receiveDelivery = useReceiveDelivery();
  const updateOrder = useUpdatePurchaseOrder();
  const updateLine = useUpdatePurchaseOrderItem();
  const deleteLine = useDeletePurchaseOrderItem();

  const [isOpen, setIsOpen] = useState(false);
  const [isItemsOpen, setIsItemsOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [draftOrder, setDraftOrder] = useState<PurchaseOrder | null>(null);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [formData, setFormData] = useState<PurchaseOrderInsert & { order_date?: string }>({ supplier_id: "", location_id: "" });
  const [itemForm, setItemForm] = useState({ ingredient_id: "", quantity: 0, cost_price: 0 });
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [lineDraft, setLineDraft] = useState({ quantity: 0, cost_price: 0 });

  // Always read the freshest copy of the open order from the list.
  const selectedOrder =
    (selectedOrderId ? orders.find((o) => o.id === selectedOrderId) : null) ?? draftOrder ?? null;

  const openOrder = (order: PurchaseOrder) => {
    setSelectedOrderId(order.id);
    setDraftOrder(order);
  };

  const { data: orderItems = [] } = usePurchaseOrderItems(selectedOrder?.id || null);
  const canEditSelected = selectedOrder ? canEditPurchaseOrder(selectedOrder) : false;


  const statusColors: Record<string, string> = {
    pending: "bg-warning/20 text-warning",
    completed: "bg-success/20 text-success",
    received: "bg-primary/20 text-primary",
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
        <Button variant="ghost" size="sm" className="h-11" onClick={() => { openOrder(item); setIsItemsOpen(true); }}>
          View <ChevronRight className="h-4 w-4" />
        </Button>
      )
    },
    {
      key: "actions",
      header: "",
      render: (item: PurchaseOrder) => {
        const editable = canEditPurchaseOrder(item);

        return (
          <div className="flex flex-wrap gap-2 justify-end">
            {editable && (
              <Button
                variant="secondary"
                size="sm"
                className="h-11 px-4"
                onClick={() => {
                  openOrder(item);
                  if (canEditPurchaseOrderHeader(item)) {
                    handleStartEdit(item);
                  } else {
                    setIsItemsOpen(true);
                  }
                }}
              >
                <Pencil className="h-4 w-4 mr-1" /> Edit
              </Button>
            )}

            {!item.received_at && item.status === "pending" && (
              <Button
                variant="outline"
                size="sm"
                className="h-11 px-4"
                onClick={() => updateStatus.mutate({ id: item.id, status: "completed" })}
              >
                <Check className="h-4 w-4 mr-1" /> Complete
              </Button>
            )}

            {!item.received_at && item.status === "completed" && (
              <Button
                variant="default"
                size="sm"
                className="h-11 px-4"
                onClick={() => { openOrder(item); setIsReceiveOpen(true); }}
              >
                <Package className="h-4 w-4 mr-1" /> Receive
              </Button>
            )}
          </div>
        );
      }
    }
  ];

  const handleStartEdit = (order: PurchaseOrder) => {
    setEditingOrder(order);
    setFormData({
      supplier_id: order.supplier_id,
      location_id: order.location_id,
      order_date: order.order_date?.slice(0, 10),
    });
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingOrder) {
      await updateOrder.mutateAsync({
        order: editingOrder,
        changes: {
          supplier_id: formData.supplier_id,
          location_id: formData.location_id,
          order_date: formData.order_date || editingOrder.order_date,
        },
      });
      handleClose();
      setIsItemsOpen(true);
      return;
    }
    const newOrder = await createOrder.mutateAsync({
      supplier_id: formData.supplier_id,
      location_id: formData.location_id,
      ...(formData.order_date ? { order_date: formData.order_date } : {}),
    });
    openOrder(newOrder as PurchaseOrder);
    handleClose();
    setIsItemsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setEditingOrder(null);
    setFormData({ supplier_id: "", location_id: "" });
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOrder) {
      await addItem.mutateAsync({
        purchase_order_id: selectedOrder.id,
        ...itemForm,
        order_status: selectedOrder.status,
      });
      setItemForm({ ingredient_id: "", quantity: 0, cost_price: 0 });
    }
  };

  const startLineEdit = (line: PurchaseOrderItem) => {
    setEditingLineId(line.id);
    setLineDraft({ quantity: Number(line.quantity), cost_price: Number(line.cost_price) });
  };

  const saveLineEdit = async (line: PurchaseOrderItem) => {
    if (!selectedOrder) return;
    await updateLine.mutateAsync({ order: selectedOrder, item: line, changes: lineDraft });
    setEditingLineId(null);
  };

  return (
    <PageLayout title="Purchase Orders" subtitle="Plan and track what you intend to order from suppliers.">
      <div className="flex justify-end mb-4">
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> New Order
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingOrder ? "Edit Purchase Order" : "Create Purchase Order"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Supplier</Label>
                <SupplierSelect
                  value={formData.supplier_id || undefined}
                  onValueChange={(v) => setFormData({ ...formData, supplier_id: v })}
                />
              </div>
              <div>
                <Label>Location</Label>
                <Select value={formData.location_id} onValueChange={(v) => setFormData({ ...formData, location_id: v })} required>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Order date</Label>
                <Input
                  className="h-11"
                  type="date"
                  value={formData.order_date || ""}
                  onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" className="h-11" onClick={handleClose}>Cancel</Button>
                <Button
                  type="submit"
                  className="h-11"
                  disabled={createOrder.isPending || updateOrder.isPending || !formData.supplier_id || !formData.location_id}
                >
                  {editingOrder ? "Save changes" : "Create & Add Items"}
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
            {selectedOrder && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  {canEditPurchaseOrderHeader(selectedOrder)
                    ? "Draft order — everything can still be changed."
                    : canEditSelected
                      ? "Order already sent — line changes are recorded in the audit log."
                      : "This order is read-only."}
                </div>
                {canEditPurchaseOrderHeader(selectedOrder) && (
                  <Button variant="secondary" className="h-11" onClick={() => handleStartEdit(selectedOrder)}>
                    <Pencil className="h-4 w-4 mr-1" /> Edit order details
                  </Button>
                )}
              </div>
            )}

            {/* Invoice Section */}
            {selectedOrder && (
              <POInvoiceSection
                purchaseOrderId={selectedOrder.id}
                locationId={selectedOrder.location_id}
                supplierId={selectedOrder.supplier_id}
                isPending={selectedOrder.status === "pending"}
                hasExistingItems={orderItems.length > 0}
                ingredients={ingredients.map(ing => ({
                  id: ing.id,
                  name: ing.name,
                  unit: ing.unit,
                  default_cost_price: Number(ing.default_cost_price),
                }))}
                onAutoFillItems={async (items) => {
                  await addItems.mutateAsync({ purchaseOrderId: selectedOrder.id, items });
                }}
              />
            )}

            {selectedOrder?.status === "pending" && (
              <form onSubmit={handleAddItem} className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[220px]">
                  <Label>Inventory item</Label>
                  <InventoryItemSelect
                    value={itemForm.ingredient_id || undefined}
                    onValueChange={(v) => {
                      const ing = ingredients.find(i => i.id === v);
                      setItemForm({ ...itemForm, ingredient_id: v, cost_price: ing ? Number(ing.default_cost_price) : 0 });
                    }}
                    placeholder="Select inventory item"
                    triggerClassName="h-11"
                  />
                </div>
                <div className="w-28">
                  <Label>Qty</Label>
                  <Input
                    className="h-11"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={itemForm.quantity}
                    onChange={(e) => setItemForm({ ...itemForm, quantity: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="w-28">
                  <Label>Price</Label>
                  <Input
                    className="h-11"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={itemForm.cost_price}
                    onChange={(e) => setItemForm({ ...itemForm, cost_price: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <Button type="submit" className="h-11" disabled={addItem.isPending || !itemForm.ingredient_id}>
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

      {/* Receive Delivery Modal */}
      <ReceiveDeliveryModal
        open={isReceiveOpen}
        onOpenChange={setIsReceiveOpen}
        orderItems={orderItems}
        isProcessing={receiveDelivery.isPending}
        onConfirm={async (items) => {
          if (!selectedOrder) return;
          await receiveDelivery.mutateAsync({
            orderId: selectedOrder.id,
            locationId: selectedOrder.location_id,
            items: items.map((item) => ({
              ingredient_id: item.ingredient_id,
              delivered_quantity: item.delivered_quantity,
            })),
          });
          setIsReceiveOpen(false);
          setSelectedOrder(null);
        }}
      />
    </PageLayout>
  );
}
