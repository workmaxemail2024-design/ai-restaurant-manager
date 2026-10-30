import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useRestaurant } from "@/contexts/RestaurantContext";
import type { ActualExpenseLike, PayrollLike, PayrollScope, VatTreatment } from "@/lib/monthlyFinancials";
import type { ExistingActual, ExistingSupplierInvoice } from "@/lib/expenseImport";

export interface ActualExpenseRow extends ActualExpenseLike, Omit<ExistingActual, "status"> {
  supplier_name: string | null;
  invoice_reference: string | null;
  source_ref: string | null;
  bill_date: string | null;
  void_reason: string | null;
  duplicate_confirmed: boolean;
  import_batch_id: string | null;
  created_at: string;
  locations?: { name: string } | null;
}

export interface PayrollRow extends PayrollLike {
  supersedes_id: string | null;
  change_reason: string | null;
  ended_reason: string | null;
  created_at: string;
  ended_at: string | null;
  import_batch_id: string | null;
  locations?: { name: string } | null;
}

export interface ImportBatchRow {
  id: string;
  filename: string;
  file_hash: string | null;
  source_type: string;
  rows_estimate: number;
  rows_actual: number;
  rows_payroll: number;
  rows_skipped: number;
  summary: Record<string, unknown>;
  document_id: string | null;
  created_at: string;
  documents?: { storage_path: string; filename: string } | null;
}

const KEYS = ["actual-expenses", "actual-payroll", "expense-import-batches", "overheads", "profit-metrics", "expense-dup-supplier-invoices"];

function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Something went wrong";
}

/** Active and voided actual bills between two dates (period month), RLS-scoped. */
export function useActualExpenses(startDate: string, endDate: string, locationId?: string | null) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  return useQuery({
    queryKey: ["actual-expenses", restaurantId, locationId ?? "all", startDate, endDate],
    enabled: !!restaurantId,
    queryFn: async () => {
      let q = supabase
        .from("actual_expenses")
        .select("*, locations(name)")
        .eq("restaurant_id", restaurantId!)
        .gte("period_month", startDate)
        .lte("period_month", endDate)
        .order("period_month", { ascending: false });
      if (locationId) q = q.eq("location_id", locationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((d) => ({ ...d, amount: Number(d.amount), vat_amount: d.vat_amount == null ? null : Number(d.vat_amount) })) as unknown as ActualExpenseRow[];
    },
  });
}

/** Confirmed payroll, including superseded/voided history (audit trail). */
export function useActualPayroll(startDate: string, endDate: string, locationId?: string | null) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  return useQuery({
    queryKey: ["actual-payroll", restaurantId, locationId ?? "all", startDate, endDate],
    enabled: !!restaurantId,
    queryFn: async () => {
      let q = supabase
        .from("actual_payroll")
        .select("*, locations(name)")
        .eq("restaurant_id", restaurantId!)
        .gte("period_month", startDate)
        .lte("period_month", endDate)
        .order("period_month", { ascending: false })
        .order("created_at", { ascending: false });
      if (locationId) q = q.eq("location_id", locationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((d) => ({ ...d, amount: Number(d.amount) })) as unknown as PayrollRow[];
    },
  });
}

export function useExpenseImportBatches() {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  return useQuery({
    queryKey: ["expense-import-batches", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_import_batches")
        .select("*, documents(storage_path, filename)")
        .eq("restaurant_id", restaurantId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as ImportBatchRow[];
    },
  });
}

/** Supplier invoices for duplicate checks (never changed by this feature). */
export function useSupplierInvoicesForDuplicates(enabled: boolean) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  return useQuery({
    queryKey: ["expense-dup-supplier-invoices", restaurantId],
    enabled: !!restaurantId && enabled,
    queryFn: async (): Promise<ExistingSupplierInvoice[]> => {
      const { data, error } = await supabase
        .from("supplier_invoices")
        .select("id, location_id, invoice_number, invoice_date, gross_amount, net_amount, status, suppliers(name)")
        .eq("restaurant_id", restaurantId!);
      if (error) throw error;
      return (data ?? []).map((d) => ({
        id: d.id, location_id: d.location_id, invoice_number: d.invoice_number, invoice_date: d.invoice_date,
        gross_amount: Number(d.gross_amount), net_amount: d.net_amount == null ? null : Number(d.net_amount), status: d.status,
        supplier_name: (d.suppliers as { name: string } | null)?.name ?? "",
      }));
    },
  });
}

export interface ApplyImportInput {
  file: File | null;
  filename: string;
  fileHash: string;
  sourceType: "xlsx" | "csv" | "pdf" | "image" | "manual";
  /** Single location for the source document, or null when the file covers several. */
  documentLocationId: string | null;
  skippedRows: number;
  summary: Record<string, unknown>;
  rows: Record<string, unknown>[];
}

/** Keeps the source file in Documents, then saves every reviewed row in one all-or-nothing call. */
export function useApplyExpenseImport() {
  const qc = useQueryClient();
  const { currentRestaurant } = useRestaurant();
  return useMutation({
    mutationFn: async (input: ApplyImportInput) => {
      const restaurantId = currentRestaurant?.id;
      if (!restaurantId) throw new Error("No restaurant selected");
      let documentId: string | null = null;
      let storagePath: string | null = null;
      if (input.file) {
        documentId = crypto.randomUUID();
        const safeName = input.file.name.replace(/[^\w.\- ]+/g, "_");
        storagePath = `restaurant/${restaurantId}/location/${input.documentLocationId ?? "all"}/document/${documentId}/${safeName}`;
        const up = await supabase.storage.from("documents").upload(storagePath, input.file, { upsert: false });
        if (up.error) throw new Error(`Could not keep the source file: ${up.error.message}`);
        const ins = await supabase.from("documents").insert({
          id: documentId, restaurant_id: restaurantId, location_id: input.documentLocationId, category: "Other",
          filename: input.file.name, mime_type: input.file.type || "application/octet-stream", storage_path: storagePath,
          notes: "Expense import source", processing_status: "processed",
        });
        if (ins.error) {
          await supabase.storage.from("documents").remove([storagePath]);
          throw new Error(`Could not keep the source file: ${ins.error.message}`);
        }
      }
      const { data, error } = await supabase.rpc("apply_expense_import", {
        p_restaurant_id: restaurantId,
        p_import: {
          filename: input.filename, file_hash: input.fileHash, source_type: input.sourceType, document_id: documentId,
          skipped_rows: input.skippedRows, summary: input.summary,
        } as never,
        p_rows: input.rows as never,
      });
      if (error) {
        // Nothing was saved; remove the just-kept file so it does not linger without an import.
        if (documentId && storagePath) {
          await supabase.from("documents").delete().eq("id", documentId);
          await supabase.storage.from("documents").remove([storagePath]);
        }
        throw new Error(errorMessage(error));
      }
      return data as { batch_id: string; estimates: number; actuals: number; payroll: number };
    },
    onSuccess: (d) => {
      KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(`Saved ${d.estimates} estimate${d.estimates === 1 ? "" : "s"}, ${d.actuals} bill${d.actuals === 1 ? "" : "s"}, ${d.payroll} payroll`);
    },
  });
}

export function useRecordPayroll() {
  const qc = useQueryClient();
  const { currentRestaurant } = useRestaurant();
  return useMutation({
    mutationFn: async (input: { locationId: string; periodMonth: string; amount: number; scope: PayrollScope; scopeNote?: string | null; replaceId?: string | null; reason?: string | null }) => {
      const { error } = await supabase.rpc("record_actual_payroll", {
        p_restaurant_id: currentRestaurant!.id,
        p_location_id: input.locationId,
        p_period_month: input.periodMonth,
        p_amount: input.amount,
        p_scope: input.scope,
        p_scope_note: input.scopeNote ?? undefined,
        p_replace_payroll_id: input.replaceId ?? undefined,
        p_change_reason: input.reason ?? undefined,
      });
      if (error) throw new Error(errorMessage(error));
    },
    onSuccess: () => {
      KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success("Confirmed payroll saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useVoidPayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("void_actual_payroll", { p_payroll_id: id, p_reason: reason });
      if (error) throw new Error(errorMessage(error));
    },
    onSuccess: () => {
      KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success("Confirmed payroll removed — the month uses estimated labour again");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useVoidActualExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("void_actual_expense", { p_expense_id: id, p_reason: reason });
      if (error) throw new Error(errorMessage(error));
    },
    onSuccess: () => {
      KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success("Bill voided");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export type { VatTreatment };
