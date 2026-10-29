import { useEffect, useMemo, useState } from "react";
import { FileUp, Loader2, Plus, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { InventoryItemSelect } from "@/components/inventory/InventoryItemSelect";
import { useIngredients } from "@/hooks/useIngredients";
import { useLocation } from "@/contexts/LocationContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import {
  lineIsReady, matchSupplierProduct, num, stockQuantityFor, totalsReconcile,
  type Cell, type InvoiceLineDraft, type SupplierProductRef,
} from "@/lib/supplierInvoice";
import { useSaveInvoiceDraft, useVerifyInvoice, type SupplierInvoice } from "@/hooks/useSupplierFinance";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Existing draft to edit */
  invoice?: SupplierInvoice | null;
}

let keySeq = 0;
const blankLine = (): InvoiceLineDraft => ({
  key: `l${++keySeq}`, description: "", product_code: "", quantity: "", pack_size: "", pack_unit: "", unit_price: "",
  line_total: "", vat_rate: "", is_stock: true, ingredient_id: null, supplier_product_id: null, stock_quantity: "",
  match_status: "unresolved", unclear: [],
});

async function fileToPayload(f: File): Promise<{ b64: string; mime: string }> {
  if (f.type.startsWith("image/")) {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return { b64: c.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "", mime: "image/jpeg" };
  }
  if (f.size > 10 * 1024 * 1024) throw new Error("File is larger than 10 MB.");
  const b64 = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(new Error("Could not read the file."));
    r.readAsDataURL(f);
  });
  return { b64, mime: f.type };
}

const cv = (c?: Cell) => (c?.status === "clear" ? c.value ?? "" : "");

export function SupplierInvoiceDialog({ open, onOpenChange, invoice }: Props) {
  const { selectedLocationId } = useLocation();
  const { data: items = [] } = useIngredients();
  const save = useSaveInvoiceDraft();
  const verify = useVerifyInvoice();

  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [docType, setDocType] = useState<"invoice" | "credit_note">("invoice");
  const [number, setNumber] = useState("");
  const [invDate, setInvDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [net, setNet] = useState("");
  const [vat, setVat] = useState("");
  const [gross, setGross] = useState("");
  const [expenseClass, setExpenseClass] = useState<"stock" | "overhead">("stock");
  const [lines, setLines] = useState<InvoiceLineDraft[]>([blankLine()]);
  const [headerUnclear, setHeaderUnclear] = useState<string[]>([]);
  const [supplierHint, setSupplierHint] = useState<string | null>(null);
  const [products, setProducts] = useState<SupplierProductRef[]>([]);
  const [doc, setDoc] = useState<{ url: string; mime: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [recordPrices, setRecordPrices] = useState(true);
  const [draftId, setDraftId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReadError(null); setHeaderUnclear([]); setSupplierHint(null);
    setDoc((d) => { if (d) URL.revokeObjectURL(d.url); return null; });
    if (invoice) {
      setDraftId(invoice.id); setSupplierId(invoice.supplier_id); setDocType(invoice.doc_type);
      setNumber(invoice.invoice_number); setInvDate(invoice.invoice_date); setDueDate(invoice.due_date ?? "");
      setNet(invoice.net_amount?.toString() ?? ""); setVat(invoice.vat_amount?.toString() ?? ""); setGross(String(invoice.gross_amount));
      setExpenseClass(invoice.expense_class);
      const ls = (invoice.supplier_invoice_lines ?? []).sort((a, b) => a.line_no - b.line_no).map((l) => ({
        ...blankLine(), description: l.description ?? "", product_code: l.product_code ?? "",
        quantity: l.quantity?.toString() ?? "", pack_size: l.pack_size?.toString() ?? "", pack_unit: l.pack_unit ?? "",
        unit_price: l.unit_price?.toString() ?? "", line_total: l.line_total?.toString() ?? "", vat_rate: l.vat_rate?.toString() ?? "",
        is_stock: l.is_stock, ingredient_id: l.ingredient_id, supplier_product_id: l.supplier_product_id,
        stock_quantity: l.stock_quantity?.toString() ?? "", match_status: l.match_status,
      }));
      setLines(ls.length ? ls : [blankLine()]);
    } else {
      setDraftId(null); setSupplierId(undefined); setDocType("invoice"); setNumber(""); setInvDate(""); setDueDate("");
      setNet(""); setVat(""); setGross(""); setExpenseClass("stock"); setLines([blankLine()]);
    }
  }, [open, invoice]);

  // Load this supplier's confirmed products for exact matching.
  useEffect(() => {
    if (!supplierId) { setProducts([]); return; }
    supabase.from("supplier_products").select("id, ingredient_id, product_name, product_code, pack_size, pack_unit")
      .eq("supplier_id", supplierId).is("archived_at", null)
      .then(({ data }) => setProducts((data ?? []) as SupplierProductRef[]));
  }, [supplierId]);

  const unitOf = (id: string | null) => items.find((i) => i.id === id)?.unit ?? null;

  const autoStockQty = (l: InvoiceLineDraft, ingredientId: string | null) => {
    const q = stockQuantityFor(num(l.quantity), num(l.pack_size), l.pack_unit || null, unitOf(ingredientId));
    return q == null ? "" : String(q);
  };

  // Re-run exact matching when the supplier's products load.
  useEffect(() => {
    if (!products.length) return;
    setLines((ls) => ls.map((l) => {
      if (!l.is_stock || l.match_status === "confirmed") return l;
      const m = matchSupplierProduct(l, products);
      if (!m) return l.match_status === "exact" ? { ...l, match_status: "unresolved", supplier_product_id: null } : l;
      const next = { ...l, supplier_product_id: m.id, ingredient_id: m.ingredient_id, match_status: "exact" as const };
      return { ...next, stock_quantity: l.stock_quantity || autoStockQty(next, m.ingredient_id) };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, items.length]);

  const setLine = (key: string, patch: Partial<InvoiceLineDraft>, field?: string) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch, unclear: field ? l.unclear.filter((u) => u !== field) : l.unclear } : l)));

  const readFile = async (f: File) => {
    setReading(true); setReadError(null);
    try {
      const { b64, mime } = await fileToPayload(f);
      const { data, error } = await supabase.functions.invoke("supplier-invoice-extract", { body: { fileBase64: b64, mimeType: mime, fileName: f.name } });
      if (error) {
        let msg = error.message;
        try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg; } catch { /* keep */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      const h = (data?.header ?? {}) as Record<string, Cell>;
      setDoc({ url: URL.createObjectURL(f), mime: f.type });
      setSupplierHint(h.supplier?.value ?? h.supplier?.raw ?? null);
      setDocType(cv(h.docType) === "credit_note" ? "credit_note" : "invoice");
      setNumber(cv(h.invoiceNumber)); setInvDate(/^\d{4}-\d{2}-\d{2}$/.test(cv(h.invoiceDate)) ? cv(h.invoiceDate) : "");
      setDueDate(/^\d{4}-\d{2}-\d{2}$/.test(cv(h.dueDate)) ? cv(h.dueDate) : "");
      setNet(cv(h.netAmount)); setVat(cv(h.vatAmount)); setGross(cv(h.grossAmount));
      setHeaderUnclear(["invoiceNumber", "invoiceDate", "netAmount", "vatAmount", "grossAmount"].filter((k) => h[k]?.status === "unclear"));
      const rows = (data?.rows ?? []) as Record<string, Cell>[];
      setLines(rows.length ? rows.map((r) => {
        const l: InvoiceLineDraft = {
          ...blankLine(), description: cv(r.description) || (r.description?.raw ?? ""), product_code: cv(r.productCode),
          quantity: cv(r.quantity), pack_size: cv(r.packSize),
          pack_unit: ["each", "g", "kg", "ml", "L"].includes(cv(r.packUnit)) ? cv(r.packUnit) : "",
          unit_price: cv(r.unitPrice), line_total: cv(r.lineTotal), vat_rate: cv(r.vatRate),
          unclear: Object.entries(r).filter(([, c]) => c?.status === "unclear").map(([k]) => k),
        };
        return l;
      }) : [blankLine()]);
      // trigger matching with already-loaded products
      setProducts((p) => [...p]);
    } catch (e) {
      setReadError(e instanceof Error ? e.message : "Could not read this document.");
    } finally {
      setReading(false);
    }
  };

  const totals = totalsReconcile(lines, num(net), num(gross));
  const notReady = lines.filter((l) => !lineIsReady(l)).length;
  const headerOk = !!supplierId && !!number.trim() && !!invDate && num(gross) != null && headerUnclear.length === 0 && !!selectedLocationId;
  const canVerify = headerOk && notReady === 0 && totals.ok;

  const payload = () => ({
    invoice: {
      id: draftId ?? undefined, location_id: selectedLocationId, supplier_id: supplierId, doc_type: docType,
      invoice_number: number.trim(), invoice_date: invDate, due_date: dueDate || null,
      net_amount: num(net), vat_amount: num(vat), gross_amount: num(gross), expense_class: expenseClass,
    },
    lines: lines.filter((l) => l.description.trim() || num(l.line_total) != null).map((l) => ({
      description: l.description, product_code: l.product_code, quantity: num(l.quantity), pack_size: num(l.pack_size),
      pack_unit: l.pack_unit || null, unit_price: num(l.unit_price), line_total: num(l.line_total), vat_rate: num(l.vat_rate),
      is_stock: l.is_stock, ingredient_id: l.is_stock ? l.ingredient_id : null,
      supplier_product_id: l.is_stock ? l.supplier_product_id : null,
      stock_quantity: l.is_stock ? num(l.stock_quantity) : null,
      match_status: !l.is_stock ? "non_stock" : l.unclear.length ? "unresolved" : l.match_status === "exact" ? "exact" : l.ingredient_id ? "confirmed" : "unresolved",
    })),
  });

  const onSave = async (andVerify: boolean) => {
    const id = (await save.mutateAsync(payload())) as unknown as string;
    setDraftId(id);
    if (andVerify) await verify.mutateAsync({ id, recordPrices });
    onOpenChange(false);
  };

  const fieldCls = (bad: boolean) => cn("h-11", bad && "border-warning bg-warning/10");
  const busy = save.isPending || verify.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[calc(100vw-2rem)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draftId ? "Edit supplier invoice" : "Add supplier invoice"}</DialogTitle>
          <DialogDescription>
            An invoice is a financial record only. It never changes stock — receive goods separately on the day they arrived.
          </DialogDescription>
        </DialogHeader>

        {!selectedLocationId && <p className="text-sm text-warning">Select a specific location first.</p>}

        <div className={cn("grid gap-4", doc && "lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]")}>
          {doc && (
            <div className="h-[40dvh] lg:h-[70dvh] overflow-auto rounded-lg border bg-muted touch-pan-x touch-pan-y lg:sticky lg:top-0">
              {doc.mime === "application/pdf"
                ? <iframe src={doc.url} title="Original invoice" className="h-full w-full" />
                : <img src={doc.url} alt="Original invoice" className="w-full" />}
            </div>
          )}

          <div className="space-y-4">
            {!draftId && (
              <label className="flex min-h-[48px] cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm">
                {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                {reading ? "Reading invoice…" : "Upload a photo or PDF to read it (or fill in manually)"}
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" disabled={reading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ""; }} />
              </label>
            )}
            {readError && <p className="text-sm text-destructive">{readError}</p>}
            {supplierHint && !supplierId && <p className="text-sm text-muted-foreground">Supplier on the document: “{supplierHint}” — choose it below.</p>}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1 sm:col-span-2">
                <Label>Supplier</Label>
                <SupplierSelect value={supplierId} onValueChange={setSupplierId} />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={docType} onValueChange={(v) => setDocType(v as "invoice" | "credit_note")}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invoice">Invoice</SelectItem>
                    <SelectItem value="credit_note">Credit note</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Counts as</Label>
                <Select value={expenseClass} onValueChange={(v) => setExpenseClass(v as "stock" | "overhead")}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stock">Stock purchases</SelectItem>
                    <SelectItem value="overhead">Overhead (already in Overheads)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Number</Label>
                <Input className={fieldCls(headerUnclear.includes("invoiceNumber"))} value={number}
                  onChange={(e) => { setNumber(e.target.value); setHeaderUnclear((u) => u.filter((x) => x !== "invoiceNumber")); }} /></div>
              <div className="space-y-1"><Label>Invoice date</Label>
                <Input type="date" className={fieldCls(headerUnclear.includes("invoiceDate"))} value={invDate}
                  onChange={(e) => { setInvDate(e.target.value); setHeaderUnclear((u) => u.filter((x) => x !== "invoiceDate")); }} /></div>
              <div className="space-y-1"><Label>Due date</Label>
                <Input type="date" className="h-11" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
              <div />
              <div className="space-y-1"><Label>Net €</Label>
                <Input inputMode="decimal" className={fieldCls(headerUnclear.includes("netAmount"))} value={net}
                  onChange={(e) => { setNet(e.target.value); setHeaderUnclear((u) => u.filter((x) => x !== "netAmount")); }} /></div>
              <div className="space-y-1"><Label>VAT €</Label>
                <Input inputMode="decimal" className={fieldCls(headerUnclear.includes("vatAmount"))} value={vat}
                  onChange={(e) => { setVat(e.target.value); setHeaderUnclear((u) => u.filter((x) => x !== "vatAmount")); }} /></div>
              <div className="space-y-1"><Label>Total €</Label>
                <Input inputMode="decimal" className={fieldCls(headerUnclear.includes("grossAmount"))} value={gross}
                  onChange={(e) => { setGross(e.target.value); setHeaderUnclear((u) => u.filter((x) => x !== "grossAmount")); }} /></div>
            </div>

            <div className={cn("flex items-center gap-2 text-sm", totals.ok ? "text-muted-foreground" : "text-warning")}>
              {totals.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              Lines add up to {formatCurrency(totals.sum)}{num(net) != null ? ` · net ${formatCurrency(num(net)!)}` : ""}
              {!totals.ok && " — must match before verifying"}
            </div>

            <div className="space-y-3">
              {lines.map((l, i) => {
                const bad = (f: string) => l.unclear.includes(f);
                return (
                  <div key={l.key} className="space-y-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">Line {i + 1}</span>
                      <div className="flex items-center gap-2">
                        {l.unclear.length > 0 && <Badge className="bg-warning/15 text-warning">{l.unclear.length} unclear</Badge>}
                        {l.is_stock && l.match_status === "exact" && <Badge variant="outline">Known supplier product</Badge>}
                        <label className="flex items-center gap-2 text-sm">
                          <Switch checked={!l.is_stock} onCheckedChange={(v) => setLine(l.key, { is_stock: !v })} /> Not stock
                        </label>
                        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Remove line"
                          onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-4 xl:grid-cols-8">
                      <Input className={cn(fieldCls(bad("description")), "sm:col-span-2 xl:col-span-3")} placeholder="Description" value={l.description}
                        onChange={(e) => setLine(l.key, { description: e.target.value }, "description")} />
                      <Input className={fieldCls(bad("productCode"))} placeholder="Code" value={l.product_code}
                        onChange={(e) => setLine(l.key, { product_code: e.target.value }, "productCode")} />
                      <Input className={fieldCls(bad("quantity"))} inputMode="decimal" placeholder="Qty" value={l.quantity}
                        onChange={(e) => setLine(l.key, { quantity: e.target.value }, "quantity")} />
                      <Input className={fieldCls(bad("packSize"))} inputMode="decimal" placeholder="Pack" value={l.pack_size}
                        onChange={(e) => setLine(l.key, { pack_size: e.target.value }, "packSize")} />
                      <Select value={l.pack_unit || "_none"} onValueChange={(v) => setLine(l.key, { pack_unit: v === "_none" ? "" : v }, "packUnit")}>
                        <SelectTrigger className={fieldCls(bad("packUnit"))}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Unit —</SelectItem>
                          {["each", "g", "kg", "ml", "L"].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input className={fieldCls(bad("lineTotal") || num(l.line_total) == null)} inputMode="decimal" placeholder="Line €" value={l.line_total}
                        onChange={(e) => setLine(l.key, { line_total: e.target.value }, "lineTotal")} />
                    </div>
                    {l.is_stock && (
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
                        <div className="space-y-1">
                          <Label className="text-xs">Inventory item</Label>
                          <InventoryItemSelect value={l.ingredient_id ?? undefined} triggerClassName="h-11"
                            onValueChange={(v) => {
                              const sp = l.supplier_product_id && products.find((p) => p.id === l.supplier_product_id)?.ingredient_id === v ? l.supplier_product_id : null;
                              const next = { ...l, ingredient_id: v, supplier_product_id: sp };
                              setLine(l.key, { ingredient_id: v, supplier_product_id: sp, match_status: sp ? "exact" : "confirmed", stock_quantity: autoStockQty(next, v) });
                            }} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Stock quantity ({unitOf(l.ingredient_id) ?? "unit"})</Label>
                          <Input className={fieldCls(num(l.stock_quantity) == null)} inputMode="decimal" value={l.stock_quantity}
                            onChange={(e) => setLine(l.key, { stock_quantity: e.target.value })} />
                        </div>
                        {l.ingredient_id && num(l.stock_quantity) == null && (
                          <p className="text-xs text-warning pb-3">Pack and item units differ — enter the stock quantity.</p>
                        )}
                      </div>
                    )}
                    {l.unclear.length > 0 && (
                      <Button variant="link" className="h-11 px-0 text-warning" onClick={() => setLine(l.key, { unclear: [] })}>
                        I have checked the highlighted values
                      </Button>
                    )}
                  </div>
                );
              })}
              <Button variant="outline" className="h-11" onClick={() => setLines((ls) => [...ls, blankLine()])}>
                <Plus className="h-4 w-4 mr-1" /> Add line
              </Button>
            </div>

            {docType === "invoice" && (
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={recordPrices} onCheckedChange={setRecordPrices} />
                On verify, record these prices in the supplier price history (recipe costs are not changed)
              </label>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" className="h-11" disabled={!headerOk || busy} onClick={() => onSave(false)}>Save draft</Button>
          <Button className="h-11" disabled={!canVerify || busy} onClick={() => onSave(true)}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save & verify
          </Button>
        </DialogFooter>
        {!canVerify && headerOk && (
          <p className="text-right text-xs text-muted-foreground">
            {notReady > 0 ? `${notReady} line(s) still need checking, an item and a stock quantity. ` : ""}
            {!totals.ok ? "Line totals must match the invoice." : ""}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
