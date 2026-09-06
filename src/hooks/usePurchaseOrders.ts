import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useRestaurant } from "@/contexts/RestaurantContext";

/** Statuses whose orders may still be edited. `received` / `cancelled` are read-only. */
export const PO_EDITABLE_STATUSES = ["pending", "completed"] as const;
/** Header (supplier / location / date) may only change while the order is still a draft. */
export const PO_HEADER_EDITABLE_STATUSES = ["pending"] as const;

export function canEditPurchaseOrder(order: { status: string; received_at?: string | null }) {
  if (order.received_at) return false;
  return (PO_EDITABLE_STATUSES as readonly string[]).includes(order.status);
}

export function canEditPurchaseOrderHeader(order: { status: string; received_at?: string | null }) {
  if (order.received_at) return false;
  return (PO_HEADER_EDITABLE_STATUSES as readonly string[]).includes(order.status);
}

export interface PurchaseOrder {
  id: string;
  supplier_id: string;
  location_id: string;
  order_date: string;
  status: string;
  created_at: string;
  updated_at: string;
  received_at: string | null;
  suppliers?: { name: string };
  locations?: { name: string };
  total?: number;
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  ingredient_id: string;
  quantity: number;
  cost_price: number;
  ingredients?: { name: string; unit: string };
}

export type PurchaseOrderInsert = {
  supplier_id: string;
  location_id: string;
  order_date?: string;
  status?: string;
};

export function usePurchaseOrders(locationId?: string | null) {
  return useQuery({
    queryKey: ["purchase-orders", locationId],
    queryFn: async () => {
      let query = supabase
        .from("purchase_orders")
        .select("*, suppliers(name), locations(name)")
        .order("order_date", { ascending: false });
      
      if (locationId) {
        query = query.eq("location_id", locationId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Calculate total for each order
      const ordersWithTotal = await Promise.all(
        data.map(async (order) => {
          const { data: items } = await supabase
            .from("purchase_order_items")
            .select("quantity, cost_price")
            .eq("purchase_order_id", order.id);
          
          const total = items?.reduce((sum, item) => sum + (item.quantity * item.cost_price), 0) || 0;
          return { ...order, total };
        })
      );
      
      return ordersWithTotal as PurchaseOrder[];
    },
  });
}

export function usePurchaseOrderItems(orderId: string | null) {
  return useQuery({
    queryKey: ["purchase-order-items", orderId],
    queryFn: async () => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select("*, ingredients(name, unit)")
        .eq("purchase_order_id", orderId);
      if (error) throw error;
      return data as PurchaseOrderItem[];
    },
    enabled: !!orderId,
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (order: PurchaseOrderInsert) => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .insert(order)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Purchase order created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating purchase order", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdatePurchaseOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      toast({ title: "Purchase order updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating purchase order", description: error.message, variant: "destructive" });
    },
  });
}

export function useAddPurchaseOrderItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: { purchase_order_id: string; ingredient_id: string; quantity: number; cost_price: number }) => {
      const { error } = await supabase.from("purchase_order_items").insert(item);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order-items", variables.purchase_order_id] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Item added to order" });
    },
    onError: (error) => {
      toast({ title: "Error adding item", description: error.message, variant: "destructive" });
    },
  });
}

export function useAddPurchaseOrderItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ purchaseOrderId, items }: { purchaseOrderId: string; items: { ingredient_id: string; quantity: number; cost_price: number }[] }) => {
      const itemsWithPO = items.map(item => ({ ...item, purchase_order_id: purchaseOrderId }));
      const { error } = await supabase.from("purchase_order_items").insert(itemsWithPO);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order-items", variables.purchaseOrderId] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (error) => {
      toast({ title: "Error adding items", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeletePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Purchase order deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting purchase order", description: error.message, variant: "destructive" });
    },
  });
}

export interface ReceiveDeliveryItem {
  ingredient_id: string;
  delivered_quantity: number;
}

export function useReceiveDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ 
      orderId, 
      locationId,
      items 
    }: { 
      orderId: string; 
      locationId: string;
      items: ReceiveDeliveryItem[] 
    }) => {
      // 1. Update PO status to received and set received_at timestamp
      const { error: updateError } = await supabase
        .from("purchase_orders")
        .update({ 
          status: "received", 
          received_at: new Date().toISOString() 
        })
        .eq("id", orderId);
      
      if (updateError) throw updateError;

      // 2. Update stock levels for each item
      for (const item of items) {
        if (item.delivered_quantity <= 0) continue;

        // Get current stock level
        const { data: existing } = await supabase
          .from("stock_levels")
          .select("id, quantity")
          .eq("ingredient_id", item.ingredient_id)
          .eq("location_id", locationId)
          .maybeSingle();

        if (existing) {
          // Update existing stock level
          const newQuantity = Number(existing.quantity) + item.delivered_quantity;
          const { error } = await supabase
            .from("stock_levels")
            .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          // Insert new stock level
          const { error } = await supabase
            .from("stock_levels")
            .insert({
              ingredient_id: item.ingredient_id,
              location_id: locationId,
              quantity: item.delivered_quantity,
            });
          if (error) throw error;
        }
      }

      return { orderId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      toast({ title: "Delivery received", description: "Stock levels have been updated" });
    },
    onError: (error) => {
      toast({ 
        title: "Error receiving delivery", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Editing: draft (pending) orders fully, completed orders line-level  */
/* ------------------------------------------------------------------ */

function usePOAudit() {
  const { currentRestaurant } = useRestaurant();
  return async (eventType: string, description: string, data: Record<string, unknown>) => {
    if (!currentRestaurant?.id) return;
    await supabase.rpc("log_audit_event", {
      p_restaurant_id: currentRestaurant.id,
      p_event_type: eventType,
      p_description: description,
      p_data: data as never,
    });
  };
}

function usePORefresh() {
  const queryClient = useQueryClient();
  return (orderId?: string) => {
    queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    queryClient.invalidateQueries({ queryKey: ["purchase-order-items", orderId] });
    queryClient.invalidateQueries({ queryKey: ["purchase-order-items"] });
    queryClient.invalidateQueries({ queryKey: ["supplier-analytics"] });
  };
}

export type PurchaseOrderHeaderUpdate = {
  supplier_id: string;
  location_id: string;
  order_date: string;
};

/** Update the header of a draft (pending) purchase order. */
export function useUpdatePurchaseOrder() {
  const refresh = usePORefresh();
  const audit = usePOAudit();

  return useMutation({
    mutationFn: async ({ order, changes }: { order: PurchaseOrder; changes: PurchaseOrderHeaderUpdate }) => {
      if (!canEditPurchaseOrderHeader(order)) {
        throw new Error("Only draft (pending) orders can have their supplier, location or date changed.");
      }
      const { error } = await supabase
        .from("purchase_orders")
        .update({
          supplier_id: changes.supplier_id,
          location_id: changes.location_id,
          order_date: changes.order_date,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      if (error) throw error;

      await audit("purchase_order_edit", "Purchase order details updated", {
        purchase_order_id: order.id,
        status: order.status,
        old_values: {
          supplier_id: order.supplier_id,
          location_id: order.location_id,
          order_date: order.order_date,
        },
        new_values: changes,
      });
      return order.id;
    },
    onSuccess: (orderId) => {
      refresh(orderId);
      toast({ title: "Purchase order updated" });
    },
    onError: (error) => {
      toast({ title: "Error updating purchase order", description: error.message, variant: "destructive" });
    },
  });
}

/** Update a single line on an editable order (pending or completed). */
export function useUpdatePurchaseOrderItem() {
  const refresh = usePORefresh();
  const audit = usePOAudit();

  return useMutation({
    mutationFn: async ({
      order,
      item,
      changes,
    }: {
      order: PurchaseOrder;
      item: PurchaseOrderItem;
      changes: { quantity: number; cost_price: number };
    }) => {
      if (!canEditPurchaseOrder(order)) throw new Error("This order can no longer be edited.");
      const { error } = await supabase
        .from("purchase_order_items")
        .update({ quantity: changes.quantity, cost_price: changes.cost_price })
        .eq("id", item.id);
      if (error) throw error;

      await audit("purchase_order_line_edit", "Purchase order line updated", {
        purchase_order_id: order.id,
        purchase_order_item_id: item.id,
        status: order.status,
        ingredient_id: item.ingredient_id,
        old_values: { quantity: Number(item.quantity), cost_price: Number(item.cost_price) },
        new_values: changes,
      });
      return order.id;
    },
    onSuccess: (orderId) => {
      refresh(orderId);
      toast({ title: "Line updated" });
    },
    onError: (error) => {
      toast({ title: "Error updating line", description: error.message, variant: "destructive" });
    },
  });
}

/** Remove a line from an editable order (pending or completed). */
export function useDeletePurchaseOrderItem() {
  const refresh = usePORefresh();
  const audit = usePOAudit();

  return useMutation({
    mutationFn: async ({ order, item }: { order: PurchaseOrder; item: PurchaseOrderItem }) => {
      if (!canEditPurchaseOrder(order)) throw new Error("This order can no longer be edited.");
      const { error } = await supabase.from("purchase_order_items").delete().eq("id", item.id);
      if (error) throw error;

      await audit("purchase_order_line_remove", "Purchase order line removed", {
        purchase_order_id: order.id,
        purchase_order_item_id: item.id,
        status: order.status,
        ingredient_id: item.ingredient_id,
        old_values: { quantity: Number(item.quantity), cost_price: Number(item.cost_price) },
      });
      return order.id;
    },
    onSuccess: (orderId) => {
      refresh(orderId);
      toast({ title: "Line removed" });
    },
    onError: (error) => {
      toast({ title: "Error removing line", description: error.message, variant: "destructive" });
    },
  });
}
