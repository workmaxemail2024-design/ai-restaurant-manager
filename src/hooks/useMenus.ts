import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { toast } from "sonner";

export interface Menu {
  id: string;
  name: string;
  location_id: string | null;
  restaurant_id: string | null;
  days: string[];
  start_time: string;
  end_time: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
  locations?: { name: string } | null;
}

export interface MenuInsert {
  name: string;
  location_id?: string | null;
  days: string[];
  start_time: string;
  end_time: string;
  status?: "active" | "archived";
}

export interface MenuUpdate extends Partial<MenuInsert> {
  id: string;
}

export interface MenuDish {
  id: string;
  menu_id: string;
  dish_id: string;
  restaurant_id: string | null;
  created_at: string;
}

// Fetch all menus for the restaurant
export function useMenus(locationId?: string | null, status?: "active" | "archived" | "all") {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  
  return useQuery({
    queryKey: ["menus", restaurantId, locationId, status],
    queryFn: async () => {
      let query = supabase
        .from("menus")
        .select("*, locations(name)")
        .eq("restaurant_id", restaurantId!)
        .order("name");
      
      if (locationId) {
        query = query.eq("location_id", locationId);
      }
      
      if (status && status !== "all") {
        query = query.eq("status", status);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      return data.map(m => ({
        ...m,
        days: Array.isArray(m.days) ? m.days : JSON.parse(m.days as string || "[]")
      })) as Menu[];
    },
    enabled: !!restaurantId,
  });
}

// Fetch a single menu with its dishes
export function useMenu(menuId: string | null) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  
  return useQuery({
    queryKey: ["menu", menuId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menus")
        .select("*, locations(name)")
        .eq("id", menuId!)
        .single();
      
      if (error) throw error;
      
      return {
        ...data,
        days: Array.isArray(data.days) ? data.days : JSON.parse(data.days as string || "[]")
      } as Menu;
    },
    enabled: !!menuId && !!restaurantId,
  });
}

// Fetch dishes for a menu
export function useMenuDishes(menuId: string | null) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  
  return useQuery({
    queryKey: ["menu-dishes", menuId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_dishes")
        .select(`
          id,
          menu_id,
          dish_id,
          dishes(id, name, category, selling_price)
        `)
        .eq("menu_id", menuId!);
      
      if (error) throw error;
      return data;
    },
    enabled: !!menuId && !!restaurantId,
  });
}

// Get all menus a dish belongs to
export function useDishMenus(dishId: string | null) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  
  return useQuery({
    queryKey: ["dish-menus", dishId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_dishes")
        .select(`
          id,
          menu_id,
          menus(id, name, days, start_time, end_time, status)
        `)
        .eq("dish_id", dishId!);
      
      if (error) throw error;
      return data;
    },
    enabled: !!dishId && !!restaurantId,
  });
}

// Create a new menu
export function useCreateMenu() {
  const queryClient = useQueryClient();
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  
  return useMutation({
    mutationFn: async (menu: MenuInsert) => {
      const { data, error } = await supabase
        .from("menus")
        .insert({ 
          ...menu, 
          restaurant_id: restaurantId,
          days: JSON.stringify(menu.days)
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menus"] });
    },
  });
}

// Update a menu
export function useUpdateMenu() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: MenuUpdate) => {
      const updateData: Record<string, unknown> = { ...updates };
      if (updates.days) {
        updateData.days = JSON.stringify(updates.days);
      }
      
      const { data, error } = await supabase
        .from("menus")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menus"] });
      queryClient.invalidateQueries({ queryKey: ["menu"] });
    },
  });
}

// Archive a menu (soft delete)
export function useArchiveMenu() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (menuId: string) => {
      const { error } = await supabase
        .from("menus")
        .update({ status: "archived" })
        .eq("id", menuId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menus"] });
      toast.success("Menu archived");
    },
    onError: (error: Error) => {
      toast.error(`Failed to archive menu: ${error.message}`);
    },
  });
}

// Restore an archived menu
export function useRestoreMenu() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (menuId: string) => {
      const { error } = await supabase
        .from("menus")
        .update({ status: "active" })
        .eq("id", menuId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menus"] });
      toast.success("Menu restored");
    },
    onError: (error: Error) => {
      toast.error(`Failed to restore menu: ${error.message}`);
    },
  });
}

// Add a dish to a menu
export function useAddDishToMenu() {
  const queryClient = useQueryClient();
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  
  return useMutation({
    mutationFn: async ({ menuId, dishId }: { menuId: string; dishId: string }) => {
      const { error } = await supabase
        .from("menu_dishes")
        .insert({ 
          menu_id: menuId, 
          dish_id: dishId,
          restaurant_id: restaurantId
        });
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["menu-dishes", variables.menuId] });
      queryClient.invalidateQueries({ queryKey: ["dish-menus"] });
      queryClient.invalidateQueries({ queryKey: ["menus"] });
      toast.success("Dish added to menu");
    },
    onError: (error: Error) => {
      if (error.message.includes("duplicate")) {
        toast.error("Dish is already in this menu");
      } else {
        toast.error(`Failed to add dish: ${error.message}`);
      }
    },
  });
}

// Remove a dish from a menu
export function useRemoveDishFromMenu() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ menuId, dishId }: { menuId: string; dishId: string }) => {
      const { error } = await supabase
        .from("menu_dishes")
        .delete()
        .eq("menu_id", menuId)
        .eq("dish_id", dishId);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["menu-dishes", variables.menuId] });
      queryClient.invalidateQueries({ queryKey: ["dish-menus"] });
      queryClient.invalidateQueries({ queryKey: ["menus"] });
      toast.success("Dish removed from menu");
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove dish: ${error.message}`);
    },
  });
}

// Bulk update dishes for a menu
export function useSetMenuDishes() {
  const queryClient = useQueryClient();
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  
  return useMutation({
    mutationFn: async ({ menuId, dishIds }: { menuId: string; dishIds: string[] }) => {
      // First, remove all existing dishes
      const { error: deleteError } = await supabase
        .from("menu_dishes")
        .delete()
        .eq("menu_id", menuId);
      
      if (deleteError) throw deleteError;
      
      // Then add the new dishes
      if (dishIds.length > 0) {
        const { error: insertError } = await supabase
          .from("menu_dishes")
          .insert(dishIds.map(dishId => ({
            menu_id: menuId,
            dish_id: dishId,
            restaurant_id: restaurantId
          })));
        
        if (insertError) throw insertError;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["menu-dishes", variables.menuId] });
      queryClient.invalidateQueries({ queryKey: ["dish-menus"] });
      queryClient.invalidateQueries({ queryKey: ["menus"] });
      queryClient.invalidateQueries({ queryKey: ["menu-dish-counts"] });
    },
  });
}

// Get dish count for each menu
export function useMenuDishCounts() {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  
  return useQuery({
    queryKey: ["menu-dish-counts", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_dishes")
        .select("menu_id");
      
      if (error) throw error;
      
      // Count dishes per menu
      const counts: Record<string, number> = {};
      data.forEach(md => {
        counts[md.menu_id] = (counts[md.menu_id] || 0) + 1;
      });
      
      return counts;
    },
    enabled: !!restaurantId,
  });
}
