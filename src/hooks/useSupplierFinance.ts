import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useRestaurant } from "@/contexts/RestaurantContext";

export interface SupplierInvoice {
  id: string;
  location_id: string;
  supplier_id: string;
  doc_type: "invoice" | "credit_note";
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  net_amount: number | null;
  vat_amount: number | null;
  gross_amount: number;
  expense_class: "stock" | "overhead";
  status: "draft" | "verified" | "void";
  purchase_order_id: string | null;
  credits_invoice_id: string | null;
  notes: string | null;
  suppliers?: { name: string } | null;
  supplier_invoice_lines?: any[];
}

export interface SupplierPayment {
  id: string;
  supplier_id: string;
  payment_date: string;
  amount: number;
  method: string | null;
  reference: string | null;
  status: "recorded" | "void";
  suppliers?: { name: string } | null;
  supplier_payment_allocations?: { invoice_id: string; amount: number }[];
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    ["supplier-invoices", "supplier-payments", "supplier-statements", "purchase-orders", "stock-levels", "stock-movements", "supplier-cashflow", "actual-food-cost"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
  };
}

export function useSupplierInvoices() {
  const { currentRestaurant } = useRestaurant();
  const rid = currentRestaurant?.id;
  return useQuery({
    queryKey: ["supplier-invoices", rid],
    enabled: !!rid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_invoices")
        .select("*, suppliers(name), supplier_invoice_lines(*)")
        .eq("restaurant_id", rid!)
        .order("invoice_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as SupplierInvoice[];
    },
  });
}

export function useSupplierPayments() {
  const { currentRestaurant } = useRestaurant();
  const rid = currentRestaurant?.id;
  return useQuery({
    queryKey: ["supplier-payments", rid],
    enabled: !!rid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_payments")
        .select("*, suppliers(name), supplier_payment_allocations(invoice_id, amount)")
        .eq("restaurant_id", rid!)
        .order("payment_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as SupplierPayment[];
    },
  });
}

/** Outstanding per invoice, computed from the same rules as the server (verified only). */
export function outstandingFor(inv: SupplierInvoice, invoices: SupplierInvoice[], payments: SupplierPayment[]): number {
  if (inv.status !== "verified" || inv.doc_type !== "invoice") return 0;
  const paid = payments
    .filter((p) => p.status === "recorded")
    .flatMap((p) => p.supplier_payment_allocations ?? [])
    .filter((a) => a.invoice_id === inv.id)
    .reduce((t, a) => t + Number(a.amount), 0);
  const credited = invoices
    .filter((c) => c.credits_invoice_id === inv.id && c.status === "verified" && c.doc_type === "credit_note")
    .reduce((t, c) => t + Number(c.gross_amount), 0);
  return Math.round((Number(inv.gross_amount) - paid - credited) * 100) / 100;
}

function rpcMutation<T>(fn: (v: T) => Promise<unknown>, success: string) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const invalidate = useInvalidate();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { invalidate(); toast({ title: success }); },
    onError: (e) => toast({ title: "Could not save", description: errMsg(e), variant: "destructive" }),
  });
}

const call = async (name: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(name as any, args as any);
  if (error) throw error;
  return data;
};

export const useSaveInvoiceDraft = () =>
  rpcMutation((v: { invoice: Record<string, unknown>; lines: Record<string, unknown>[] }) =>
    call("save_supplier_invoice_draft", { p_invoice: v.invoice, p_lines: v.lines }), "Invoice saved as draft");
export const useVerifyInvoice = () =>
  rpcMutation((v: { id: string; recordPrices: boolean }) =>
    call("verify_supplier_invoice", { p_invoice_id: v.id, p_record_supplier_prices: v.recordPrices }), "Invoice verified");
export const useVoidInvoice = () =>
  rpcMutation((v: { id: string; reason: string }) => call("void_supplier_invoice", { p_invoice_id: v.id, p_reason: v.reason }), "Invoice voided");
export const useReceiveInvoiceGoods = () =>
  rpcMutation((v: { id: string; deliveryDate: string }) =>
    call("receive_invoice_goods", { p_invoice_id: v.id, p_delivery_date: v.deliveryDate }), "Goods received on the delivery date");
export const useLinkInvoiceReceipt = () =>
  rpcMutation((v: { id: string; poId: string }) =>
    call("link_invoice_receipt", { p_invoice_id: v.id, p_purchase_order_id: v.poId }), "Invoice linked to delivery (no stock added)");
export const useRecordPayment = () =>
  rpcMutation((v: { supplierId: string; date: string; amount: number; method: string; reference: string; allocations: { invoice_id: string; amount: number }[] }) =>
    call("record_supplier_payment", {
      p_supplier_id: v.supplierId, p_payment_date: v.date, p_amount: v.amount, p_method: v.method || null,
      p_reference: v.reference || null, p_allocations: v.allocations,
    }), "Payment recorded");
export const useVoidPayment = () =>
  rpcMutation((v: { id: string; reason: string }) => call("void_supplier_payment", { p_payment_id: v.id, p_reason: v.reason }), "Payment voided");

export interface SupplierStatement {
  id: string;
  supplier_id: string;
  statement_date: string;
  closing_balance: number;
  suppliers?: { name: string } | null;
  supplier_statement_lines?: {
    id: string; line_date: string | null; reference: string | null; line_type: string; amount: number;
    matched_invoice_id: string | null; matched_payment_id: string | null; match_status: string;
  }[];
}

export function useSupplierStatements() {
  const { currentRestaurant } = useRestaurant();
  const rid = currentRestaurant?.id;
  return useQuery({
    queryKey: ["supplier-statements", rid],
    enabled: !!rid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_statements")
        .select("*, suppliers(name), supplier_statement_lines(*)")
        .eq("restaurant_id", rid!)
        .order("statement_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SupplierStatement[];
    },
  });
}

export function useStatementReconciliation(id: string | null) {
  return useQuery({
    queryKey: ["supplier-statements", "recon", id],
    enabled: !!id,
    queryFn: async () => (await call("reconcile_supplier_statement", { p_statement_id: id })) as {
      our_balance: number; statement_balance: number; difference: number;
    },
  });
}

export const useSaveStatement = () =>
  rpcMutation((v: { supplierId: string; date: string; closing: number; lines: Record<string, unknown>[] }) =>
    call("save_supplier_statement", {
      p_supplier_id: v.supplierId, p_statement_date: v.date, p_period_start: null, p_period_end: null,
      p_closing_balance: v.closing, p_document_id: null, p_lines: v.lines,
    }), "Statement saved and matched");
export const useConfirmStatementMatch = () =>
  rpcMutation((v: { lineId: string; invoiceId: string | null; paymentId: string | null }) =>
    call("confirm_statement_match", { p_line_id: v.lineId, p_invoice_id: v.invoiceId, p_payment_id: v.paymentId }), "Match saved");

export interface SupplierCashflow {
  paid_stock: number; paid_overhead_invoices: number; unallocated_payments: number;
  payables_outstanding: number; payables_overdue: number;
}
export function useSupplierCashflow(start: string, end: string) {
  const { currentRestaurant } = useRestaurant();
  const rid = currentRestaurant?.id;
  return useQuery({
    queryKey: ["supplier-cashflow", rid, "all", start, end],
    enabled: !!rid,
    queryFn: async () => (await call("get_supplier_cashflow", { p_restaurant_id: rid, p_start: start, p_end: end })) as SupplierCashflow,
  });
}
