import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { toast } from "@/hooks/use-toast";

export interface DishCategory {
  id: string;
  name: string;
  sort_order: number;
  archived_at: string | null;
  /** Number of dishes (any location, incl. archived) using this category. */
  dish_count: number;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Restaurant-scoped category list (per-restaurant, custom order) with dish counts. */
export function useDishCategories() {
  const { currentRestaurant } = useRestaurant();
  const rid = currentRestaurant?.id;
  return useQuery({
    queryKey: ["dish-categories", rid],
    enabled: !!rid,
    queryFn: async (): Promise<DishCategory[]> => {
      const db = supabase as any;
      const { data: cats, error } = await db
        .from("dish_categories")
        .select("id, name, sort_order, archived_at")
        .eq("restaurant_id", rid)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      const counts = new Map<string, number>();
      for (let from = 0; ; from += 1000) {
        const { data, error: dErr } = await supabase
          .from("dishes")
          .select("category")
          .eq("restaurant_id", rid!)
          .not("category", "is", null)
          .range(from, from + 999);
        if (dErr) throw dErr;
        for (const d of data || []) counts.set(norm(d.category), (counts.get(norm(d.category)) || 0) + 1);
        if (!data || data.length < 1000) break;
      }
      return (cats || []).map((c: any) => ({ ...c, dish_count: counts.get(norm(c.name)) || 0 }));
    },
  });
}

/** Active category names in custom order (for dropdowns). */
export function useActiveCategoryNames() {
  const q = useDishCategories();
  return { ...q, names: (q.data || []).filter((c) => !c.archived_at).map((c) => c.name) };
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["dish-categories"] });
    qc.invalidateQueries({ queryKey: ["dishes"] });
  };
}

const onErr = (title: string) => (e: Error) => toast({ title, description: e.message, variant: "destructive" });

export function useAddCategory() {
  const { currentRestaurant } = useRestaurant();
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async ({ name, sort_order }: { name: string; sort_order: number }) => {
      if (!currentRestaurant?.id) throw new Error("No active restaurant");
      const { error } = await (supabase as any)
        .from("dish_categories")
        .insert({ restaurant_id: currentRestaurant.id, name: name.trim(), sort_order });
      if (error) throw new Error(error.code === "23505" ? "That category already exists" : error.message);
    },
    onSuccess: () => { inv(); toast({ title: "Category added" }); },
    onError: onErr("Could not add category"),
  });
}

export function useRenameCategory() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (p: { id: string; name: string; merge?: boolean }) => {
      const { data, error } = await (supabase as any).rpc("rename_dish_category", {
        p_id: p.id, p_new_name: p.name, p_merge: !!p.merge,
      });
      if (error) throw error;
      return data as { dishes_updated: number; merged_into?: string };
    },
    onSuccess: (r) => {
      inv();
      toast({ title: r?.merged_into ? "Categories merged" : "Category renamed", description: `${r?.dishes_updated ?? 0} dish(es) updated` });
    },
    onError: onErr("Could not rename category"),
  });
}

export function useReorderCategories() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (rows: { id: string; sort_order: number }[]) => {
      for (const r of rows) {
        const { error } = await (supabase as any).from("dish_categories").update({ sort_order: r.sort_order }).eq("id", r.id);
        if (error) throw error;
      }
    },
    onSuccess: inv,
    onError: onErr("Could not reorder"),
  });
}

export function useRemoveCategory() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (p: { id: string; moveTo?: string | null }) => {
      const { data, error } = await (supabase as any).rpc("remove_dish_category", { p_id: p.id, p_move_to: p.moveTo ?? null });
      if (error) throw error;
      return data as { action: string; dishes_moved: number };
    },
    onSuccess: (r) => {
      inv();
      toast({ title: r?.action === "deleted" ? "Category removed" : "Category archived", description: r?.dishes_moved ? `${r.dishes_moved} dish(es) moved` : undefined });
    },
    onError: onErr("Could not remove category"),
  });
}

export function useSetCategoryArchived() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (p: { id: string; archived: boolean }) => {
      const { error } = await (supabase as any)
        .from("dish_categories").update({ archived_at: p.archived ? new Date().toISOString() : null }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: (_, p) => { inv(); toast({ title: p.archived ? "Category archived" : "Category restored" }); },
    onError: onErr("Could not update category"),
  });
}
