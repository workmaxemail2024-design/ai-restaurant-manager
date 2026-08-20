import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Dish } from "@/hooks/useDishes";

/**
 * Lifecycle actions for canonical dish records (public.dishes).
 *
 * Rules:
 *  - Archive is the normal way to retire a dish. Recipes, POS mappings and
 *    historical sales stay linked and the dish can be restored.
 *  - Hard delete is only allowed when nothing depends on the dish. Historical
 *    sales are never cascade-deleted to make a delete possible.
 *  - Merge repoints every dependent reference onto the master dish and archives
 *    the duplicate; conflicting recipe/price data is only overwritten when the
 *    user explicitly confirms which record wins.
 */

const DISH_QUERY_KEYS = [
  ["dishes"],
  ["dish-ingredients"],
  ["menu-dishes"],
  ["menu-dish-map"],
  ["sales"],
  ["theoretical-usage"],
  ["pos-mappings"],
  ["external-pos-items"],
  ["external-pos-items-catalogue"],
];

function invalidateDishes(queryClient: ReturnType<typeof useQueryClient>) {
  DISH_QUERY_KEYS.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
}

export interface DishDependencies {
  sales: number;
  posItems: number;
  posImports: number;
  posMappings: number;
  recipeLines: number;
  menuRefs: number;
  inventoryLinks: number;
  mergedChildren: number;
  total: number;
  canDelete: boolean;
}

async function countRows(table: string, build: (q: any) => any): Promise<number> {
  const { count, error } = await build(
    (supabase as any).from(table).select("id", { count: "exact", head: true }),
  );
  if (error) throw error;
  return count || 0;
}

export async function fetchDishDependencies(dishId: string): Promise<DishDependencies> {
  const [sales, posItems, posImports, posMappings, recipeLines, menuRefs, inventoryLinks, mergedChildren] =
    await Promise.all([
      countRows("sales", (q) => q.eq("dish_id", dishId)),
      countRows("external_pos_items", (q) => q.eq("mapped_dish_id", dishId)),
      countRows("pos_sales_import", (q) => q.eq("mapped_dish_id", dishId)),
      countRows("pos_mappings", (q) => q.eq("mapping_type", "dish").eq("internal_id", dishId)),
      countRows("dish_ingredients", (q) => q.eq("dish_id", dishId)),
      countRows("menu_dishes", (q) => q.eq("dish_id", dishId)),
      countRows("ingredients", (q) => q.eq("linked_dish_id", dishId)),
      countRows("dishes", (q) => q.eq("merged_into_id", dishId)),
    ]);

  const total =
    sales + posItems + posImports + posMappings + recipeLines + menuRefs + inventoryLinks + mergedChildren;

  return {
    sales,
    posItems,
    posImports,
    posMappings,
    recipeLines,
    menuRefs,
    inventoryLinks,
    mergedChildren,
    total,
    canDelete: total === 0,
  };
}

/** Live dependency lookup used by the delete confirmation and merge comparison. */
export function useDishDependencies(dishId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["dish-dependencies", dishId],
    enabled: !!dishId && enabled,
    queryFn: () => fetchDishDependencies(dishId!),
  });
}

export function useArchiveDish() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("dishes")
        .update({
          archived_at: archived ? new Date().toISOString() : null,
          archived_by: archived ? auth?.user?.id ?? null : null,
          // restoring a merged duplicate un-links it from its master
          merged_into_id: archived ? undefined : null,
        })
        .eq("id", id);
      if (error) throw error;
      return archived;
    },
    onSuccess: (archived) => {
      invalidateDishes(queryClient);
      toast({
        title: archived ? "Dish archived" : "Dish restored",
        description: archived
          ? "Hidden from active views. Recipe, POS mappings and sales history are kept."
          : "Visible again in Dishes and Cost Analysis.",
      });
    },
    onError: (e: Error) => toast({ title: "Archive failed", description: e.message, variant: "destructive" }),
  });
}

export function useSafeDeleteDish() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dish: Pick<Dish, "id">) => {
      const deps = await fetchDishDependencies(dish.id);
      if (!deps.canDelete) {
        throw new Error("This dish has linked data. Archive or merge it instead.");
      }
      const { error } = await supabase.from("dishes").delete().eq("id", dish.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateDishes(queryClient);
      toast({ title: "Dish deleted permanently" });
    },
    onError: (e: Error) => toast({ title: "Delete blocked", description: e.message, variant: "destructive" }),
  });
}

export interface MergeDishInput {
  masterId: string;
  duplicateId: string;
  useDuplicateRecipe: boolean;
  useDuplicatePrice: boolean;
  useDuplicateName: boolean;
  useDuplicateCategory: boolean;
}

export function useMergeDishes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MergeDishInput) => {
      const { data, error } = await (supabase as any).rpc("merge_dishes", {
        p_master_id: input.masterId,
        p_duplicate_id: input.duplicateId,
        p_use_duplicate_recipe: input.useDuplicateRecipe,
        p_use_duplicate_price: input.useDuplicatePrice,
        p_use_duplicate_name: input.useDuplicateName,
        p_use_duplicate_category: input.useDuplicateCategory,
      });
      if (error) throw error;
      return data as { moved_sales?: number };
    },
    onSuccess: (data) => {
      invalidateDishes(queryClient);
      toast({
        title: "Dishes merged",
        description: `${data?.moved_sales ?? 0} sales record(s) moved to the master dish. The duplicate was archived, not deleted.`,
      });
    },
    onError: (e: Error) => toast({ title: "Merge failed", description: e.message, variant: "destructive" }),
  });
}
