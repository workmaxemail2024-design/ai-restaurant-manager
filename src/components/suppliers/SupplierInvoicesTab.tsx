import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Plus, PackageCheck, Link2, Ban, Pencil, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/currency";
import { usePermissions } from "@/hooks/usePermissions";
import {
  outstandingFor, useLinkInvoiceReceipt, useReceiveInvoiceGoods, useSupplierInvoices, useSupplierPayments,
  useVerifyInvoice, useVoidInvoice, type SupplierInvoice,
} from "@/hooks/useSupplierFinance";
import { SupplierInvoiceDialog } from "./SupplierInvoiceDialog";

const today = () => new Date().toISOString().slice(0, 10);

export function SupplierInvoicesTab() {
  const { data: invoices = [], isLoading } = useSupplierInvoices();
  const { data: payments = [] } = useSupplierPayments();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("inventory", "edit");
  const verify = useVerifyInvoice();
  const voidInv = useVoidInvoice();
  const receive = useReceiveInvoiceGoods();
  const link = useLinkInvoiceReceipt();

  const [editing, setEditing] = useState<SupplierInvoice | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [receiving, setReceiving] = useState<SupplierInvoice | null>(null);
  const [deliveryDate, setDeliveryDate] = useState(today());
  const [linking, setLinking] = useState<SupplierInvoice | null>(null);
  const [poId, setPoId] = useState<string>("");
  const [voiding, setVoiding] = useState<SupplierInvoice | null>(null);
  const [reason, setReason] = useState("");

  const linkedPOs = useMemo(() => new Set(invoices.filter((i) => i.status !== "void" && i.purchase_order_id).map((i) => i.purchase_order_id)), [invoices]);
  const { data: receivedPOs = [] } = useQuery({
    queryKey: ["purchase-orders", "received-for-link", linking?.supplier_id],
    enabled: !!linking,
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_orders").select("id, delivery_date, order_date, received_at")
        .eq("supplier_id", linking!.supplier_id).not("received_at", "is", null).order("received_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const statusBadge = (i: SupplierInvoice) =>
    i.status === "verified" ? <Badge variant="outline" className="border-success text-success">Verified</Badge>
      : i.status === "void" ? <Badge variant="outline" className="text-muted-foreground">Void</Badge>
      : <Badge variant="outline" className="border-warning text-warning">Draft</Badge>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Invoices are financial records. Stock only changes when goods are received on their delivery date.
          Payments are recorded separately with their own payment date.
        </p>
        {canEdit && <Button className="h-11" onClick={() => setOpenNew(true)}><Plus className="h-4 w-4 mr-1" /> Add invoice</Button>}
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead><TableHead>Supplier</TableHead><TableHead>Number</TableHead>
              <TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Outstanding</TableHead><TableHead>Goods</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={8}>Loading…</TableCell></TableRow>
              : invoices.length === 0 ? <TableRow><TableCell colSpan={8} className="text-muted-foreground">No supplier invoices yet.</TableCell></TableRow>
              : invoices.map((i) => {
                const out = outstandingFor(i, invoices, payments);
                const hasStock = (i.supplier_invoice_lines ?? []).some((l) => l.is_stock);
                return (
                  <TableRow key={i.id}>
                    <TableCell className="whitespace-nowrap">{format(parseISO(i.invoice_date), "d MMM yyyy")}</TableCell>
                    <TableCell>{i.suppliers?.name}</TableCell>
                    <TableCell>{i.invoice_number}{i.doc_type === "credit_note" && <Badge variant="outline" className="ml-2">Credit note</Badge>}</TableCell>
                    <TableCell>{statusBadge(i)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(i.gross_amount))}</TableCell>
                    <TableCell className="text-right">{i.status === "verified" && i.doc_type === "invoice" ? formatCurrency(out) : "—"}</TableCell>
                    <TableCell>
                      {i.purchase_order_id ? <Badge variant="outline">Received</Badge>
                        : i.doc_type === "invoice" && hasStock && i.status !== "void" ? <span className="text-sm text-warning">Not received</span> : "—"}
                    </TableCell>
                    <TableCell>
                      {canEdit && (
                        <div className="flex flex-wrap justify-end gap-1">
                          {i.status === "draft" && (
                            <>
                              <Button variant="outline" size="sm" className="h-11" onClick={() => setEditing(i)}><Pencil className="h-4 w-4 mr-1" />Edit</Button>
                              <Button variant="outline" size="sm" className="h-11" disabled={verify.isPending}
                                onClick={() => verify.mutate({ id: i.id, recordPrices: true })}><CheckCircle2 className="h-4 w-4 mr-1" />Verify</Button>
                            </>
                          )}
                          {i.status === "verified" && i.doc_type === "invoice" && !i.purchase_order_id && hasStock && (
                            <>
                              <Button size="sm" className="h-11" onClick={() => { setReceiving(i); setDeliveryDate(i.invoice_date > today() ? today() : i.invoice_date); }}>
                                <PackageCheck className="h-4 w-4 mr-1" />Receive goods
                              </Button>
                              <Button variant="outline" size="sm" className="h-11" onClick={() => { setLinking(i); setPoId(""); }}>
                                <Link2 className="h-4 w-4 mr-1" />Already received
                              </Button>
                            </>
                          )}
                          {i.status !== "void" && (
                            <Button variant="ghost" size="sm" className="h-11" onClick={() => { setVoiding(i); setReason(""); }}><Ban className="h-4 w-4 mr-1" />Void</Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>

      <SupplierInvoiceDialog open={openNew || !!editing} invoice={editing}
        onOpenChange={(o) => { if (!o) { setOpenNew(false); setEditing(null); } }} />

      <Dialog open={!!receiving} onOpenChange={(o) => !o && setReceiving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive goods for {receiving?.invoice_number}</DialogTitle>
            <DialogDescription>Stock is added on the day the goods physically arrived — not the invoice date.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>Delivery date</Label>
            <Input type="date" className="h-11" max={today()} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setReceiving(null)}>Cancel</Button>
            <Button className="h-11" disabled={!deliveryDate || receive.isPending}
              onClick={() => receiving && receive.mutate({ id: receiving.id, deliveryDate }, { onSuccess: () => setReceiving(null) })}>Receive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linking} onOpenChange={(o) => !o && setLinking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link to a delivery already received</DialogTitle>
            <DialogDescription>Use this when the goods were received through a purchase order. No stock is added again.</DialogDescription>
          </DialogHeader>
          <Select value={poId || "_none"} onValueChange={(v) => setPoId(v === "_none" ? "" : v)}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Choose a delivery" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Choose a delivery</SelectItem>
              {receivedPOs.filter((p) => !linkedPOs.has(p.id)).map((p) => (
                <SelectItem key={p.id} value={p.id} className="h-11">
                  Delivered {p.delivery_date ?? p.received_at?.slice(0, 10)} · order {p.order_date}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setLinking(null)}>Cancel</Button>
            <Button className="h-11" disabled={!poId || link.isPending}
              onClick={() => linking && link.mutate({ id: linking.id, poId }, { onSuccess: () => setLinking(null) })}>Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void invoice {voiding?.invoice_number}?</DialogTitle>
            <DialogDescription>The invoice stays in the history marked Void. Any received stock is not changed — reverse it in Stock if needed.</DialogDescription>
          </DialogHeader>
          <Input className="h-11" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setVoiding(null)}>Cancel</Button>
            <Button variant="destructive" className="h-11" disabled={reason.trim().length < 3 || voidInv.isPending}
              onClick={() => voiding && voidInv.mutate({ id: voiding.id, reason: reason.trim() }, { onSuccess: () => setVoiding(null) })}>Void</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
