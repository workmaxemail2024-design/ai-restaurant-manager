import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { History, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocations } from "@/hooks/useLocations";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useActualExpenses, useActualPayroll, useExpenseImportBatches, useRecordPayroll, useVoidActualExpense, useVoidPayroll,
  type PayrollRow,
} from "@/hooks/useExpenseImport";
import { formatCurrency } from "@/lib/currency";
import { PAYROLL_SCOPE_LABELS, VAT_LABELS, type PayrollScope } from "@/lib/monthlyFinancials";

const monthLabel = (d: string) => format(parseISO(d), "MMMM yyyy");

function PayrollDialog({ open, onOpenChange, correcting }: { open: boolean; onOpenChange: (o: boolean) => void; correcting: PayrollRow | null }) {
  const { data: locations = [] } = useLocations();
  const record = useRecordPayroll();
  const [locationId, setLocationId] = useState("");
  const [month, setMonth] = useState("");
  const [amount, setAmount] = useState("");
  const [scope, setScope] = useState<PayrollScope | "">("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const loc = correcting?.location_id ?? locationId;
  const mon = correcting ? correcting.period_month.slice(0, 7) : month;
  const amt = Number(amount);
  const valid = !!loc && !!mon && amt > 0 && !!scope && (scope !== "other" || note.trim()) && (!correcting || reason.trim());

  const close = () => { setLocationId(""); setMonth(""); setAmount(""); setScope(""); setNote(""); setReason(""); onOpenChange(false); };
  const save = async () => {
    await record.mutateAsync({ locationId: loc, periodMonth: `${mon}-01`, amount: Math.round(amt * 100) / 100, scope: scope as PayrollScope, scopeNote: note || null, replaceId: correcting?.id ?? null, reason: reason || null });
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{correcting ? "Correct confirmed payroll" : "Add confirmed payroll"}</DialogTitle>
          <DialogDescription>
            The accountant-confirmed total replaces estimated labour for that location and month in Monthly Reports. Employee records, attendance and shifts are not changed.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {correcting ? (
            <p className="text-sm">{correcting.locations?.name} · {monthLabel(correcting.period_month)} · currently <strong>{formatCurrency(correcting.amount)}</strong></p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Select value={locationId || "_none"} onValueChange={(v) => setLocationId(v === "_none" ? "" : v)}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Choose…</SelectItem>
                    {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Accounting month</Label>
                <Input type="month" className="h-11" max={format(new Date(), "yyyy-MM")} value={month} onChange={(e) => setMonth(e.target.value)} />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Payroll total (€)</Label>
            <Input className="h-11" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} placeholder="e.g. 37382.65" />
          </div>
          <div className="space-y-1.5">
            <Label>What the total includes</Label>
            <Select value={scope || "_none"} onValueChange={(v) => setScope(v === "_none" ? "" : (v as PayrollScope))}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Choose…</SelectItem>
                {(Object.keys(PAYROLL_SCOPE_LABELS) as PayrollScope[]).map((k) => <SelectItem key={k} value={k}>{PAYROLL_SCOPE_LABELS[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {scope === "other" && <Input className="h-11" placeholder="Describe the scope" value={note} onChange={(e) => setNote(e.target.value)} />}
          {correcting && (
            <div className="space-y-1.5">
              <Label>Reason for the correction</Label>
              <Input className="h-11" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. accountant revised employer PRSI" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={close}>Cancel</Button>
          <Button className="h-11" disabled={!valid || record.isPending} onClick={save}>{record.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReasonDialog({ title, open, onCancel, onConfirm, pending }: { title: string; open: boolean; onCancel: () => void; onConfirm: (reason: string) => void; pending: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setReason(""); onCancel(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>The record stays in history with your reason.</DialogDescription>
        </DialogHeader>
        <Input className="h-11" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => { setReason(""); onCancel(); }}>Cancel</Button>
          <Button variant="destructive" className="h-11" disabled={!reason.trim() || pending} onClick={() => { onConfirm(reason.trim()); setReason(""); }}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExpenseRecordsPanel({ locationId }: { locationId: string | null }) {
  const { hasPermission } = usePermissions();
  // UI hint only; the save functions enforce Owner / Finance Edit on the server.
  const canEdit = hasPermission("finance", "edit");
  const { data: payroll = [] } = useActualPayroll("2000-01-01", "2100-12-01", locationId);
  const { data: actuals = [] } = useActualExpenses("2000-01-01", "2100-12-01", locationId);
  const { data: batches = [] } = useExpenseImportBatches();
  const voidPayroll = useVoidPayroll();
  const voidExpense = useVoidActualExpense();
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [correcting, setCorrecting] = useState<PayrollRow | null>(null);
  const [voidingPayroll, setVoidingPayroll] = useState<string | null>(null);
  const [voidingExpense, setVoidingExpense] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const shownPayroll = useMemo(() => payroll.filter((p) => showHistory || p.status === "active"), [payroll, showHistory]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Confirmed payroll, actual bills & import history</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="payroll">
          <TabsList className="h-11">
            <TabsTrigger value="payroll" className="h-9">Confirmed payroll</TabsTrigger>
            <TabsTrigger value="bills" className="h-9">Actual bills</TabsTrigger>
            <TabsTrigger value="history" className="h-9">Import history</TabsTrigger>
          </TabsList>

          <TabsContent value="payroll" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">Used instead of estimated labour in Monthly Reports. Weekly reports stay estimated.</p>
              <div className="flex gap-2">
                <Button variant="ghost" className="h-10" onClick={() => setShowHistory((s) => !s)}><History className="mr-2 h-4 w-4" />{showHistory ? "Hide history" : "Show history"}</Button>
                {canEdit && <Button className="h-10" onClick={() => { setCorrecting(null); setPayrollOpen(true); }}><Plus className="mr-2 h-4 w-4" />Add payroll</Button>}
              </div>
            </div>
            {shownPayroll.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No confirmed payroll yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Location</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Includes</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
                  <TableBody>
                    {shownPayroll.map((p) => (
                      <TableRow key={p.id} className={p.status !== "active" ? "opacity-60" : ""}>
                        <TableCell className="whitespace-nowrap">{monthLabel(p.period_month)}</TableCell>
                        <TableCell>{p.locations?.name}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(p.amount)}</TableCell>
                        <TableCell>{PAYROLL_SCOPE_LABELS[p.scope]}{p.scope_note ? ` — ${p.scope_note}` : ""}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{p.source === "accountant_import" ? "Accountant import" : "Entered"} · {format(parseISO(p.created_at), "d MMM yy")}{p.change_reason ? ` · ${p.change_reason}` : ""}</TableCell>
                        <TableCell>
                          <Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status === "active" ? "Current" : p.status === "superseded" ? "Corrected" : "Removed"}</Badge>
                          {p.ended_reason && <p className="mt-1 text-xs text-muted-foreground">{p.ended_reason}</p>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {canEdit && p.status === "active" && (
                            <div className="flex gap-1">
                              <Button variant="outline" size="sm" className="h-10" onClick={() => { setCorrecting(p); setPayrollOpen(true); }}>Correct</Button>
                              <Button variant="ghost" size="sm" className="h-10 text-destructive" onClick={() => setVoidingPayroll(p.id)}>Remove</Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="bills">
            {actuals.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No actual bills recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Location</TableHead><TableHead>Bill</TableHead><TableHead>Invoice no.</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>VAT</TableHead><TableHead /></TableRow></TableHeader>
                  <TableBody>
                    {actuals.map((e) => (
                      <TableRow key={e.id} className={e.status === "void" ? "opacity-60" : ""}>
                        <TableCell className="whitespace-nowrap">{monthLabel(e.period_month)}</TableCell>
                        <TableCell>{e.locations?.name}</TableCell>
                        <TableCell>
                          {e.description}{e.supplier_name ? <span className="text-muted-foreground"> · {e.supplier_name}</span> : null}
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className="text-[10px]">{e.category}</Badge>
                            {e.replaces_overhead_id && <Badge variant="secondary" className="text-[10px]">Replaces estimate</Badge>}
                            {e.duplicate_confirmed && <Badge variant="outline" className="text-[10px]">Confirmed separate bill</Badge>}
                            {e.status === "void" && <Badge variant="secondary" className="text-[10px]">Void: {e.void_reason}</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>{e.invoice_reference ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(e.amount)}</TableCell>
                        <TableCell className="text-xs">{VAT_LABELS[e.vat_treatment]}{e.vat_amount != null ? ` · ${formatCurrency(e.vat_amount)}` : ""}</TableCell>
                        <TableCell>{canEdit && e.status === "active" && <Button variant="ghost" size="sm" className="h-10 text-destructive" onClick={() => setVoidingExpense(e.id)}>Void</Button>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            {batches.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No imports yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Imported</TableHead><TableHead>File</TableHead><TableHead className="text-right">Estimates</TableHead><TableHead className="text-right">Bills</TableHead><TableHead className="text-right">Payroll</TableHead><TableHead className="text-right">Skipped</TableHead><TableHead>Worksheets</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {batches.map((b) => {
                      const sheets = (b.summary?.sheets as { name: string; location: string }[] | undefined) ?? [];
                      return (
                        <TableRow key={b.id}>
                          <TableCell className="whitespace-nowrap">{format(parseISO(b.created_at), "d MMM yyyy HH:mm")}</TableCell>
                          <TableCell>{b.filename}{b.document_id ? <span className="block text-xs text-muted-foreground">Kept in Documents</span> : null}</TableCell>
                          <TableCell className="text-right">{b.rows_estimate}</TableCell>
                          <TableCell className="text-right">{b.rows_actual}</TableCell>
                          <TableCell className="text-right">{b.rows_payroll}</TableCell>
                          <TableCell className="text-right">{b.rows_skipped}</TableCell>
                          <TableCell className="text-xs">{sheets.map((s) => `${s.name} → ${s.location}`).join(", ")}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      <PayrollDialog open={payrollOpen} onOpenChange={setPayrollOpen} correcting={correcting} />
      <ReasonDialog title="Remove confirmed payroll?" open={!!voidingPayroll} pending={voidPayroll.isPending}
        onCancel={() => setVoidingPayroll(null)}
        onConfirm={async (reason) => { await voidPayroll.mutateAsync({ id: voidingPayroll!, reason }); setVoidingPayroll(null); }} />
      <ReasonDialog title="Void this bill?" open={!!voidingExpense} pending={voidExpense.isPending}
        onCancel={() => setVoidingExpense(null)}
        onConfirm={async (reason) => { await voidExpense.mutateAsync({ id: voidingExpense!, reason }); setVoidingExpense(null); }} />
    </Card>
  );
}
