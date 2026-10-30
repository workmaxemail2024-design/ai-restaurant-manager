import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import {
  EXPENSE_CATEGORIES, KIND_LABELS, reviewMonthly,
  type DuplicateFinding, type ExistingOverhead, type ExistingPayroll, type ReviewRow, type RowKind,
} from "@/lib/expenseImport";
import { PAYROLL_SCOPE_LABELS, VAT_LABELS, type Frequency, type PayrollScope, type VatTreatment } from "@/lib/monthlyFinancials";

const FREQ_LABELS: Record<Frequency, string> = {
  monthly: "Monthly", quarterly: "Quarterly", yearly: "Annual", weekly: "Weekly", daily: "Daily", one_time: "One-time",
};

interface Props {
  row: ReviewRow;
  issues: string[];
  duplicate: DuplicateFinding | null;
  existingPayroll: ExistingPayroll | null;
  locationName: string;
  locations: { id: string; name: string }[];
  sheetLocationId: string | null;
  estimatesForLocation: ExistingOverhead[];
  suggestedEstimateId: string | null;
  effectivePeriod: string;
  effectiveStart: string;
  onChange: (patch: Partial<ReviewRow>) => void;
}

export function ExpenseReviewRowCard({
  row, issues, duplicate, existingPayroll, locationName, locations, sheetLocationId,
  estimatesForLocation, suggestedEstimateId, effectivePeriod, effectiveStart, onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const skip = row.kind === "skip";
  const monthly = row.kind === "estimate" ? reviewMonthly(row) : null;
  const suggested = suggestedEstimateId ? estimatesForLocation.find((o) => o.id === suggestedEstimateId) : null;

  return (
    <div className={cn("rounded-lg border p-3", skip && "bg-muted/30", !skip && issues.length > 0 && "border-warning/60")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-14 shrink-0 text-xs text-muted-foreground">Row {row.rowNumber}</span>
        <Select value={row.kind} onValueChange={(v: RowKind) => onChange({ kind: v, kindReason: null })}>
          <SelectTrigger className="h-11 w-44" aria-label="What this row is"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(KIND_LABELS) as RowKind[]).map((k) => <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="h-11 min-w-[10rem] flex-1" value={row.name} onChange={(e) => onChange({ name: e.target.value })} aria-label="Name" />
        <div className="relative w-32">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
          <Input className="h-11 pl-7 text-right font-mono" inputMode="decimal" value={row.amount} placeholder="Unknown"
            onChange={(e) => onChange({ amount: e.target.value })} aria-label="Amount" />
        </div>
        {skip ? (
          <Badge variant="outline" className="h-7">Skipped</Badge>
        ) : issues.length === 0 ? (
          <Badge variant="secondary" className="h-7 gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Ready</Badge>
        ) : (
          <Badge variant="outline" className="h-7 gap-1 border-warning text-warning"><AlertTriangle className="h-3.5 w-3.5" />{issues.length} to fix</Badge>
        )}
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11" onClick={() => setOpen((o) => !o)} aria-label={open ? "Hide details" : "Show details"}>
          {open ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </div>

      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 pl-16 text-xs text-muted-foreground">
        {row.sourceCategory && <span>File category: {row.sourceCategory}</span>}
        {row.kind === "estimate" && row.frequency && <span>{FREQ_LABELS[row.frequency]}{monthly != null && row.frequency !== "monthly" ? ` → ${formatCurrency(monthly)} / month` : ""}</span>}
        {!skip && <span>{VAT_LABELS[row.vat]}{row.vatFromFile ? " (from file)" : ""}</span>}
        {row.kindReason && <span>{row.kindReason}</span>}
        {row.notes && <span className="truncate">Notes: {row.notes}</span>}
      </div>

      {!skip && issues.length > 0 && (
        <ul className="mt-2 space-y-0.5 pl-16 text-xs text-warning">
          {issues.map((i) => <li key={i}>• {i}</li>)}
        </ul>
      )}

      {!skip && duplicate?.level === "possible" && (
        <div className="mt-2 flex items-start gap-2 rounded-md bg-muted/50 p-2 pl-3 sm:ml-16">
          <Copy className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="flex-1 text-sm">
            <p>Possible duplicate: {duplicate.message}.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" className="h-10" variant={row.confirmDuplicate ? "default" : "outline"} onClick={() => onChange({ confirmDuplicate: true })}>It's a separate bill — keep</Button>
              <Button type="button" size="sm" className="h-10" variant="outline" onClick={() => onChange({ kind: "skip", kindReason: "Skipped as duplicate" })}>Skip it</Button>
            </div>
          </div>
        </div>
      )}

      {!skip && row.kind === "actual" && suggested && row.replacesOverheadId !== suggested.id && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2 text-sm sm:ml-16">
          <span>This bill may replace the estimate “{suggested.name}” for {effectivePeriod || "its month"}.</span>
          <Button type="button" size="sm" variant="outline" className="h-10" onClick={() => onChange({ replacesOverheadId: suggested.id })}>Replace estimate this month</Button>
        </div>
      )}

      {open && !skip && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:pl-16">
          <Field label="Location">
            <Select value={row.locationOverride ?? "_sheet"} onValueChange={(v) => onChange({ locationOverride: v === "_sheet" ? null : v, replacesOverheadId: null })}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_sheet">Worksheet location{sheetLocationId ? ` (${locations.find((l) => l.id === sheetLocationId)?.name ?? "?"})` : " (not set)"}</SelectItem>
                {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          {row.kind !== "payroll" && (
            <>
              <Field label="Supplier">
                <Input className="h-11" value={row.supplier} onChange={(e) => onChange({ supplier: e.target.value })} />
              </Field>
              <Field label="Category">
                <Select value={row.category || "_none"} onValueChange={(v) => onChange({ category: v === "_none" ? "" : (v as ReviewRow["category"]) })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Choose…</SelectItem>
                    {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="VAT">
                <Select value={row.vat} onValueChange={(v: VatTreatment) => onChange({ vat: v, vatFromFile: false })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(VAT_LABELS) as VatTreatment[]).map((k) => <SelectItem key={k} value={k}>{VAT_LABELS[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Fixed / variable">
                <Select value={row.costType || "_none"} onValueChange={(v) => onChange({ costType: v === "_none" ? "" : (v as "fixed" | "variable") })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Not stated</SelectItem>
                    <SelectItem value="fixed">Fixed</SelectItem>
                    <SelectItem value="variable">Variable</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </>
          )}

          {row.kind === "estimate" && (
            <>
              <Field label="How often">
                <Select value={row.frequency || "_none"} onValueChange={(v) => onChange({ frequency: v === "_none" ? "" : (v as Frequency), frequencyConflict: null })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Choose…</SelectItem>
                    {(Object.keys(FREQ_LABELS) as Frequency[]).map((f) => <SelectItem key={f} value={f}>{FREQ_LABELS[f]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={`Applies from${!row.startMonth && effectiveStart ? ` (import: ${effectiveStart})` : ""}`}>
                <Input className="h-11" type="month" value={row.startMonth} onChange={(e) => onChange({ startMonth: e.target.value })} />
              </Field>
            </>
          )}

          {(row.kind === "actual" || row.kind === "payroll") && (
            <Field label={`Accounting month${!row.periodMonth && effectivePeriod ? ` (import: ${effectivePeriod})` : ""}`}>
              <Input className="h-11" type="month" value={row.periodMonth} onChange={(e) => onChange({ periodMonth: e.target.value })} />
            </Field>
          )}

          {row.kind === "actual" && (
            <>
              <Field label="Invoice / reference number">
                <Input className="h-11" value={row.invoiceRef} onChange={(e) => onChange({ invoiceRef: e.target.value, confirmDuplicate: false })} placeholder="Recommended" />
              </Field>
              <Field label="Bill date (optional)">
                <Input className="h-11" type="date" value={row.billDate} onChange={(e) => onChange({ billDate: e.target.value })} />
              </Field>
              <Field label="VAT amount (optional)">
                <Input className="h-11" inputMode="decimal" value={row.vatAmount} onChange={(e) => onChange({ vatAmount: e.target.value })} placeholder="Unknown" />
              </Field>
              <Field label="Replaces recurring estimate for this month">
                <Select value={row.replacesOverheadId ?? "_none"} onValueChange={(v) => onChange({ replacesOverheadId: v === "_none" ? null : v })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None — an extra cost</SelectItem>
                    {estimatesForLocation.map((o) => <SelectItem key={o.id} value={o.id}>{o.name} ({formatCurrency(Number(o.amount))} {o.frequency})</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </>
          )}

          {row.kind === "payroll" && (
            <>
              <Field label="What the total includes">
                <Select value={row.payrollScope || "_none"} onValueChange={(v) => onChange({ payrollScope: v === "_none" ? "" : (v as PayrollScope), payrollScopeFromFile: false })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Choose…</SelectItem>
                    {(Object.keys(PAYROLL_SCOPE_LABELS) as PayrollScope[]).map((k) => <SelectItem key={k} value={k}>{PAYROLL_SCOPE_LABELS[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
                {row.payrollScopeFromFile && <p className="mt-1 text-xs text-muted-foreground">Read from the file's notes — please check.</p>}
              </Field>
              {row.payrollScope === "other" && (
                <Field label="Describe the scope">
                  <Input className="h-11" value={row.payrollScopeNote} onChange={(e) => onChange({ payrollScopeNote: e.target.value })} />
                </Field>
              )}
            </>
          )}
        </div>
      )}

      {row.kind === "payroll" && (
        <div className="mt-3 space-y-2 rounded-md bg-muted/40 p-3 text-sm sm:ml-16">
          {existingPayroll && (
            <div className="space-y-2">
              <p>{locationName} already has confirmed payroll of <strong>{formatCurrency(Number(existingPayroll.amount))}</strong> for this month.</p>
              <label className="flex min-h-11 items-center gap-3">
                <Checkbox checked={row.replacePayrollId === existingPayroll.id} onCheckedChange={(c) => onChange({ replacePayrollId: c ? existingPayroll.id : null })} className="h-5 w-5" />
                <span>Correct it with this figure (the old one stays in history)</span>
              </label>
              {row.replacePayrollId === existingPayroll.id && (
                <Input className="h-11" placeholder="Reason for the correction" value={row.changeReason} onChange={(e) => onChange({ changeReason: e.target.value })} />
              )}
            </div>
          )}
          <label className="flex min-h-11 items-center gap-3">
            <Checkbox checked={row.payrollConfirmed} onCheckedChange={(c) => onChange({ payrollConfirmed: !!c })} className="h-5 w-5" />
            <span>
              Accountant-confirmed payroll for <strong>{locationName || "—"}</strong>, <strong>{effectivePeriod || "month not chosen"}</strong>
              {row.payrollScope ? <> — {PAYROLL_SCOPE_LABELS[row.payrollScope]}</> : null}. It replaces estimated labour for that month.
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
