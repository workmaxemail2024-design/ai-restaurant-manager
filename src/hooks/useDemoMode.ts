import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useRestaurant } from "@/contexts/RestaurantContext";

interface DemoStatus {
  success: boolean;
  restaurant_name?: string;
  counts?: {
    sales: number;
    staff: number;
    dishes: number;
    ingredients: number;
  };
}

interface SeedResult {
  success: boolean;
  message?: string;
  summary?: {
    suppliers: number;
    ingredients: number;
    dishes: number;
    staff: number;
    purchase_orders: number;
  };
  error?: string;
}

interface PrepareLivePosResult {
  success: boolean;
  message?: string;
  deletedCounts?: {
    sales: number;
    pos_sales_import: number;
    pos_staff_import: number;
    pos_sync_logs: number;
    purchase_orders: number;
    purchase_order_items: number;
    documents: number;
    stock_levels: number;
    stock_adjustments: number;
    dishes: number;
    dish_ingredients: number;
    ingredients: number;
    ingredient_prices: number;
    suppliers: number;
    overheads: number;
    staff: number;
    staff_shifts: number;
    staff_attendance: number;
    staff_performance: number;
    notifications: number;
    audit_logs: number;
    automation_rule_runs: number;
  };
  error?: string;
}

export function useDemoStatus() {
  const { currentRestaurant } = useRestaurant();
  
  return useQuery({
    queryKey: ["demo-status", currentRestaurant?.id],
    queryFn: async (): Promise<DemoStatus> => {
      if (!currentRestaurant?.id) {
        return { success: false };
      }
      
      const { data, error } = await supabase.functions.invoke("demo-data", {
        body: { action: "get_status", restaurant_id: currentRestaurant.id }
      });
      
      if (error) throw error;
      return data as DemoStatus;
    },
    enabled: !!currentRestaurant?.id,
  });
}

export function useResetDemoData() {
  const queryClient = useQueryClient();
  const { currentRestaurant } = useRestaurant();
  
  return useMutation({
    mutationFn: async () => {
      if (!currentRestaurant?.id) {
        throw new Error("No restaurant selected");
      }
      
      const { data, error } = await supabase.functions.invoke("demo-data", {
        body: { action: "reset", restaurant_id: currentRestaurant.id }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Reset failed");
      return data;
    },
    onSuccess: () => {
      // Invalidate all data queries
      queryClient.invalidateQueries();
      toast({ title: "Demo Data Reset", description: "All operational data has been cleared" });
    },
    onError: (error) => {
      toast({ title: "Reset Failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useSeedDemoData() {
  const queryClient = useQueryClient();
  const { currentRestaurant } = useRestaurant();
  
  return useMutation({
    mutationFn: async (): Promise<SeedResult> => {
      if (!currentRestaurant?.id) {
        throw new Error("No restaurant selected");
      }
      
      const { data, error } = await supabase.functions.invoke("demo-data", {
        body: { action: "seed", restaurant_id: currentRestaurant.id }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Seed failed");
      return data as SeedResult;
    },
    onSuccess: (data) => {
      // Invalidate all data queries
      queryClient.invalidateQueries();
      const summary = data.summary;
      toast({ 
        title: "Demo Data Seeded", 
        description: summary 
          ? `Created ${summary.staff} staff, ${summary.dishes} dishes, ${summary.ingredients} ingredients, ${summary.suppliers} suppliers`
          : "Sample data has been created"
      });
    },
    onError: (error) => {
      toast({ title: "Seed Failed", description: error.message, variant: "destructive" });
    },
  });
}

// Local storage key for demo mode
const DEMO_MODE_KEY = "demo_mode_enabled";

export function useDemoModeToggle() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      localStorage.setItem(DEMO_MODE_KEY, enabled ? "true" : "false");
      return enabled;
    },
    onSuccess: (enabled) => {
      queryClient.invalidateQueries({ queryKey: ["demo-mode"] });
      toast({ 
        title: enabled ? "Demo Mode Enabled" : "Demo Mode Disabled",
        description: enabled ? "A demo banner will be shown" : "Demo banner has been hidden"
      });
    },
  });
}

export function useIsDemoMode() {
  return useQuery({
    queryKey: ["demo-mode"],
    queryFn: () => {
      return localStorage.getItem(DEMO_MODE_KEY) === "true";
    },
    staleTime: Infinity,
  });
}

export function usePrepareLivePos() {
  const queryClient = useQueryClient();
  const { currentRestaurant } = useRestaurant();
  
  return useMutation({
    mutationFn: async (): Promise<PrepareLivePosResult> => {
      if (!currentRestaurant?.id) {
        throw new Error("No restaurant selected");
      }
      
      const { data, error } = await supabase.functions.invoke("demo-data", {
        body: { action: "prepare_live_pos", restaurant_id: currentRestaurant.id }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Prepare failed");
      return data as PrepareLivePosResult;
    },
    onSuccess: (data) => {
      // Invalidate all data queries
      queryClient.invalidateQueries();
      const counts = data.deletedCounts;
      const totalDeleted = counts 
        ? Object.values(counts).reduce((sum, val) => sum + val, 0)
        : 0;
      toast({ 
        title: "Ready for Live POS", 
        description: `Cleared ${totalDeleted} records. Your restaurant is now ready for real POS data.`
      });
    },
    onError: (error) => {
      toast({ title: "Prepare Failed", description: error.message, variant: "destructive" });
    },
  });
}
