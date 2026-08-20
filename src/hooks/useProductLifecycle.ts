import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { ProductClass } from "@/lib/productClassification";
import { toStoredClassification } from "@/lib/productClassification";

/**
 * Lifecycle actions for canonical POS products (public.external_pos_items).
 *
 * Rules:
 *  - Editing only touches manual/correction fields. Raw imported identifiers
 *    (external_item_id, external_item_name, department) are preserved so future
 *    imports keep matching.
 *  - Archive is the normal way to retire a product. Archived rows stay attached
 *    to sales / historical aggregates and can be restored.
 *  - Hard delete is only allowed when there is no dependent data.
 */

const PRODUCT_QUERY_KEYS = [
  ["external-pos-items"],
  ["external-pos-items-catalogue"],
  ["daily-breakdown-classification"],
  ["pos-sales-imports"],
  ["historical-pos-rows"],
  ["dishes"],
];

function invalidateProducts(queryClient: ReturnType<typeof useQueryClient>) {
  PRODUCT_QUERY_KEYS.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
}

export interface CanonicalProductRef {
  id: string;
  external_item_id: string;
  location_id: string;
  mapped_dish_id: string | null;
}

export interface ProductDependencies {
  posSalesImports: number;
  historicalRows: number;
  dishMapping: number;
  dishSales: number;
  inventoryLinks: number;
  mergedChildren: number;
  total: number;
  canDelete: boolean;
}

async function countRows(
  table: string,
  build: (q: any) => any,
): Promise<number> {
  const { count, error } = await build(
    (supabase as any).from(table).select("id", { count: "exact", head: true }),
  );
  if (error) throw error;
  return count || 0;
}

export async function fetchProductDependencies(
  item: CanonicalProductRef,
): Promise<ProductDependencies> {
  const [posSalesImports, historicalRows, mergedChildren] = await Promise.all([
    countRows("pos_sales_import", (q) =>
      q.eq("external_item_id", item.external_item_id).eq("location_id", item.location_id)),
    countRows("historical_pos_product_summaries", (q) =>
      q.eq("external_item_id", item.external_item_id).eq("location_id", item.location_id)),
    countRows("external_pos_items", (q) => q.eq("merged_into_id", item.id)),
  ]);

  let dishSales = 0;
  let inventoryLinks = 0;
  if (item.mapped_dish_id) {
    [dishSales, inventoryLinks] = await Promise.all([
      countRows("sales", (q) => q.eq("dish_id", item.mapped_dish_id)),
      countRows("ingredients", (q) => q.eq("linked_dish_id", item.mapped_dish_id)),
    ]);
  }

  const dishMapping = item.mapped_dish_id ? 1 : 0;
  const total =
    posSalesImports + historicalRows + dishMapping + dishSales + inventoryLinks + mergedChildren;

  return {
    posSalesImports,
    historicalRows,
    dishMapping,
    dishSales,
    inventoryLinks,
    mergedChildren,
    total,
    canDelete: total === 0,
  };
}

/** Live dependency lookup used by the delete confirmation dialog. */
export function useProductDependencies(item: CanonicalProductRef | null, enabled = true) {
  return useQuery({
    queryKey: ["product-dependencies", item?.id],
    enabled: !!item && enabled,
    queryFn: () => fetchProductDependencies(item!),
  });
}

export interface ProductEditInput {
  id: string;
  /** Manual display override — raw imported name is never overwritten. */
  display_name?: string | null;
  /** Manual department override — raw imported department is preserved. */
  manual_department?: string | null;
  productClass?: ProductClass | null;
  needs_review?: boolean;
}

export function useEditCanonicalProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProductEditInput) => {
      const update: Record<string, unknown> = {};
      if (input.display_name !== undefined) {
        const v = (input.display_name || "").trim();
        update.display_name = v.length ? v : null;
      }
      if (input.manual_department !== undefined) {
        const v = (input.manual_department || "").trim();
        update.manual_department = v.length ? v : null;
      }
      if (input.productClass) Object.assign(update, toStoredClassification(input.productClass));
      if (input.needs_review !== undefined) update.needs_review = input.needs_review;

      const { error } = await (supabase as any)
        .from("external_pos_items")
        .update(update)
        .eq("id", input.id);
      if (error) throw error;
      return input.id;
    },
    onSuccess: () => {
      invalidateProducts(queryClient);
      toast({ title: "Product updated" });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
}

export function useArchiveCanonicalProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("external_pos_items")
        .update({
          archived_at: archived ? new Date().toISOString() : null,
          archived_by: archived ? auth?.user?.id ?? null : null,
        })
        .eq("id", id);
      if (error) throw error;
      return archived;
    },
    onSuccess: (archived) => {
      invalidateProducts(queryClient);
      toast({
        title: archived ? "Product archived" : "Product restored",
        description: archived
          ? "Hidden from active views. Historical data is untouched."
          : "Visible again in active views.",
      });
    },
    onError: (e: Error) => toast({ title: "Archive failed", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteCanonicalProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: CanonicalProductRef) => {
      // Re-check dependencies server-side at the moment of deletion — never
      // cascade-delete sales or historical aggregates to force a delete.
      const deps = await fetchProductDependencies(item);
      if (!deps.canDelete) {
        throw new Error("This product has historical or mapped data. Archive it instead.");
      }
      const { error } = await (supabase as any)
        .from("external_pos_items")
        .delete()
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateProducts(queryClient);
      toast({ title: "Product deleted permanently" });
    },
    onError: (e: Error) => toast({ title: "Delete blocked", description: e.message, variant: "destructive" }),
  });
}
