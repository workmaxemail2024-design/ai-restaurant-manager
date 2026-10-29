import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Plus, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { formatCurrency } from "@/lib/currency";
import { num } from "@/lib/supplierInvoice";
import { usePermissions } from "@/hooks/usePermissions";
import { outstandingFor, useRecordPayment, useSupplierInvoices, useSupplierPayments, useVoidPayment, type SupplierPayment } from "@/hooks/useSupplierFinance";

const today = () => new Date().toISOString().slice(0, 10);

export function SupplierPaymentsTab() {
  const { data: payments = [], isLoading } = useSupplierPayments();
  const { data: invoices = [] } = useSupplierInvoices();
  const { hasPermission } = usePermissions();
  const canPay = hasPermission("finance", "edit");
  const record = useRecordPayment();
  const voidPay = useVoidPayment();

  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [voiding, setVoiding] = useState<SupplierPayment | null>(null);
  const [reason, setReason] = useState("");

  const openInvoices = useMemo(
    () => invoices.filter((i) => i.supplier_id === supplierId && i.status === "verified" && i.doc_type === "invoice")
      .map((i) => ({ i, out: outstandingFor(i, invoices, payments) })).filter((x) => x.out > 0.004),
    [invoices, payments, supplierId],
  );
  const allocTotal = Object.values(alloc).reduce((t, v) => t + (num(v) ?? 0), 0);
  const amt = num(amount);
  const overAlloc = openInvoices.some(({ i, out }) => (num(alloc[i.id]) ?? 0) > out + 0.004);
  const valid = !!supplierId && !!date && date <= today() && amt != null && amt > 0 && allocTotal <= amt + 0.004 && !overAlloc;

  const reset = () => { setSupplierId(undefined); setDate(today()); setAmount(""); setMethod(""); setReference(""); setAlloc({}); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Payments use the date the money actually left the account. Cash Flow uses these, not invoice dates.
        </p>
        {canPay && <Button className="h-11" onClick={() => { reset(); setOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Record payment</Button>}
      </div>
      {!canPay && <p className="text-sm text-muted-foreground">Recording payments needs Owner or Finance Edit permission.</p>}

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Paid on</TableHead><TableHead>Supplier</TableHead><TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Allocated</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={6}>Loading…</TableCell></TableRow>
              : payments.length === 0 ? <TableRow><TableCell colSpan={6} className="text-muted-foreground">No supplier payments yet.</TableCell></TableRow>
              : payments.map((p) => (
                <TableRow key={p.id} className={p.status === "void" ? "opacity-50" : ""}>
                  <TableCell>{format(parseISO(p.payment_date), "d MMM yyyy")}</TableCell>
                  <TableCell>{p.suppliers?.name}</TableCell>
                  <TableCell>{p.reference ?? "—"}{p.status === "void" && <Badge variant="outline" className="ml-2">Void</Badge>}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(p.amount))}</TableCell>
                  <TableCell className="text-right">{formatCurrency((p.supplier_payment_allocations ?? []).reduce((t, a) => t + Number(a.amount), 0))}</TableCell>
                  <TableCell className="text-right">
                    {canPay && p.status === "recorded" && (
                      <Button variant="ghost" size="sm" className="h-11" onClick={() => { setVoiding(p); setReason(""); }}><Ban className="h-4 w-4 mr-1" />Void</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record supplier payment</DialogTitle>
            <DialogDescription>Allocate the payment to the invoices it pays. Any unallocated amount stays visible.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2"><Label>Supplier</Label><SupplierSelect value={supplierId} onValueChange={(v) => { setSupplierId(v); setAlloc({}); }} /></div>
            <div className="space-y-1"><Label>Payment date</Label><Input type="date" className="h-11" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1"><Label>Amount €</Label><Input inputMode="decimal" className="h-11" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="space-y-1"><Label>Method</Label><Input className="h-11" placeholder="Bank transfer" value={method} onChange={(e) => setMethod(e.target.value)} /></div>
            <div className="space-y-1"><Label>Reference</Label><Input className="h-11" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          </div>
          {supplierId && (
            <div className="space-y-2">
              <Label>Allocate to invoices</Label>
              {openInvoices.length === 0 ? <p className="text-sm text-muted-foreground">No verified unpaid invoices for this supplier.</p>
                : openInvoices.map(({ i, out }) => (
                  <div key={i.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm">{i.invoice_number} · {i.invoice_date} · outstanding {formatCurrency(out)}</span>
                    <Input inputMode="decimal" className="h-11 w-28" value={alloc[i.id] ?? ""} onChange={(e) => setAlloc((a) => ({ ...a, [i.id]: e.target.value }))} />
                  </div>
                ))}
              <p className={allocTotal > (amt ?? 0) + 0.004 || overAlloc ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
                Allocated {formatCurrency(allocTotal)} of {formatCurrency(amt ?? 0)}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="h-11" disabled={!valid || record.isPending}
              onClick={() => record.mutate({
                supplierId: supplierId!, date, amount: amt!, method, reference,
                allocations: Object.entries(alloc).map(([invoice_id, v]) => ({ invoice_id, amount: num(v) ?? 0 })).filter((a) => a.amount > 0),
              }, { onSuccess: () => setOpen(false) })}>Record payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Void this payment?</DialogTitle><DialogDescription>It stays in the history marked Void.</DialogDescription></DialogHeader>
          <Input className="h-11" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setVoiding(null)}>Cancel</Button>
            <Button variant="destructive" className="h-11" disabled={reason.trim().length < 3}
              onClick={() => voiding && voidPay.mutate({ id: voiding.id, reason: reason.trim() }, { onSuccess: () => setVoiding(null) })}>Void</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
