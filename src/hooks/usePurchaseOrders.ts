import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface PurchaseOrder {
  id: string;
  supplier_id: string;
  location_id: string;
  order_date: string;
  status: string;
  created_at: string;
  updated_at: string;
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

export function usePurchaseOrders() {
  return useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*, suppliers(name), locations(name)")
        .order("order_date", { ascending: false });
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
