import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { formatCurrency } from "@/lib/currency";
import { num } from "@/lib/supplierInvoice";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useConfirmStatementMatch, useSaveStatement, useStatementReconciliation, useSupplierInvoices, useSupplierPayments,
  useSupplierStatements, type SupplierStatement,
} from "@/hooks/useSupplierFinance";

type DraftLine = { key: number; line_date: string; reference: string; line_type: string; amount: string };
let k = 0;
const blank = (): DraftLine => ({ key: ++k, line_date: "", reference: "", line_type: "invoice", amount: "" });

function StatementCard({ s }: { s: SupplierStatement }) {
  const { data: recon } = useStatementReconciliation(s.id);
  const { data: invoices = [] } = useSupplierInvoices();
  const { data: payments = [] } = useSupplierPayments();
  const confirm = useConfirmStatementMatch();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("inventory", "edit");
  const lines = s.supplier_statement_lines ?? [];
  const matchedInv = new Set(lines.map((l) => l.matched_invoice_id).filter(Boolean));
  const missingFromStatement = invoices.filter((i) => i.supplier_id === s.supplier_id && i.status === "verified" && i.invoice_date <= s.statement_date && !matchedInv.has(i.id));
  const supplierInvoices = invoices.filter((i) => i.supplier_id === s.supplier_id && i.status !== "void");
  const supplierPayments = payments.filter((p) => p.supplier_id === s.supplier_id && p.status === "recorded");
  const amountOf = (l: (typeof lines)[number]) => {
    if (l.matched_invoice_id) { const i = invoices.find((x) => x.id === l.matched_invoice_id); return i ? (i.doc_type === "credit_note" ? -1 : 1) * Number(i.gross_amount) : null; }
    if (l.matched_payment_id) { const p = payments.find((x) => x.id === l.matched_payment_id); return p ? -Number(p.amount) : null; }
    return null;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>{s.suppliers?.name} · statement {s.statement_date}</span>
          {recon && (
            <span className={Math.abs(recon.difference) < 0.01 ? "text-success text-sm" : "text-warning text-sm"}>
              Statement {formatCurrency(Number(recon.statement_balance))} · our records {formatCurrency(Number(recon.our_balance))}
              {Math.abs(recon.difference) >= 0.01 && ` · difference ${formatCurrency(Number(recon.difference))}`}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Type</TableHead>
              <TableHead className="text-right">Statement</TableHead><TableHead className="text-right">Ours</TableHead><TableHead>Match</TableHead></TableRow></TableHeader>
            <TableBody>
              {lines.map((l) => {
                const ours = amountOf(l);
                const diff = ours != null && Math.abs(ours - Number(l.amount)) >= 0.01;
                return (
                  <TableRow key={l.id}>
                    <TableCell>{l.line_date ?? "—"}</TableCell>
                    <TableCell>{l.reference ?? "—"}</TableCell>
                    <TableCell>{l.line_type.replace("_", " ")}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(l.amount))}</TableCell>
                    <TableCell className={diff ? "text-right text-warning" : "text-right"}>{ours == null ? "—" : formatCurrency(ours)}</TableCell>
                    <TableCell>
                      {l.match_status === "unmatched" ? (
                        canEdit ? (
                          <Select value="_none" onValueChange={(v) => {
                            const [kind, id] = v.split(":");
                            confirm.mutate({ lineId: l.id, invoiceId: kind === "i" ? id : null, paymentId: kind === "p" ? id : null });
                          }}>
                            <SelectTrigger className="h-11 w-56 border-warning text-warning"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">Missing from our records</SelectItem>
                              {supplierInvoices.map((i) => <SelectItem key={i.id} value={`i:${i.id}`}>Invoice {i.invoice_number}</SelectItem>)}
                              {supplierPayments.map((p) => <SelectItem key={p.id} value={`p:${p.id}`}>Payment {p.payment_date} {formatCurrency(Number(p.amount))}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : <Badge variant="outline" className="border-warning text-warning">Missing from our records</Badge>
                      ) : <Badge variant="outline">{diff ? "Amount differs" : l.match_status === "auto" ? "Matched" : "Confirmed"}</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {missingFromStatement.length > 0 && (
          <p className="text-sm text-warning">
            Not on the statement: {missingFromStatement.map((i) => `${i.invoice_number} (${formatCurrency(Number(i.gross_amount))})`).join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function SupplierStatementsTab() {
  const { data: statements = [], isLoading } = useSupplierStatements();
  const save = useSaveStatement();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("inventory", "edit");
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [closing, setClosing] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([blank()]);
  const valid = useMemo(() => !!supplierId && !!date && num(closing) != null && lines.every((l) => num(l.amount) != null || (!l.reference && !l.amount)), [supplierId, date, closing, lines]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Enter a monthly supplier statement to check it against verified invoices, credit notes and payments.
          Charges are positive; credit notes and payments are negative.
        </p>
        {canEdit && <Button className="h-11" onClick={() => { setSupplierId(undefined); setClosing(""); setLines([blank()]); setOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Add statement</Button>}
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
        : statements.length === 0 ? <p className="text-sm text-muted-foreground">No statements yet.</p>
        : statements.map((s) => <StatementCard key={s.id} s={s} />)}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add supplier statement</DialogTitle><DialogDescription>Lines are matched automatically by invoice number or payment amount and date.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-3"><Label>Supplier</Label><SupplierSelect value={supplierId} onValueChange={setSupplierId} /></div>
            <div className="space-y-1"><Label>Statement date</Label><Input type="date" className="h-11" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1"><Label>Closing balance €</Label><Input inputMode="decimal" className="h-11" value={closing} onChange={(e) => setClosing(e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.key} className="grid gap-2 grid-cols-2 sm:grid-cols-[1fr_1.2fr_1fr_1fr_auto]">
                <Input type="date" className="h-11" value={l.line_date} onChange={(e) => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, line_date: e.target.value } : x))} />
                <Input className="h-11" placeholder="Reference" value={l.reference} onChange={(e) => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, reference: e.target.value } : x))} />
                <Select value={l.line_type} onValueChange={(v) => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, line_type: v } : x))}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invoice">Invoice</SelectItem><SelectItem value="credit_note">Credit note</SelectItem>
                    <SelectItem value="payment">Payment</SelectItem><SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Input inputMode="decimal" className="h-11" placeholder="€" value={l.amount} onChange={(e) => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, amount: e.target.value } : x))} />
                <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Remove line" onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" className="h-11" onClick={() => setLines((ls) => [...ls, blank()])}><Plus className="h-4 w-4 mr-1" />Add line</Button>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="h-11" disabled={!valid || save.isPending}
              onClick={() => save.mutate({
                supplierId: supplierId!, date, closing: num(closing)!,
                lines: lines.filter((l) => num(l.amount) != null).map((l) => ({ line_date: l.line_date || null, reference: l.reference, line_type: l.line_type, amount: num(l.amount) })),
              }, { onSuccess: () => setOpen(false) })}>Save & match</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
