import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ClipboardList, ExternalLink, Lock, Unlock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/currency";
import {
  CLOSE_STATE_LABELS, MONTH_END_ITEMS, canConfirm, deriveCloseState, itemStatus, monthEndGuidance, validateItemChange,
  type DetectedFacts, type ItemStatus,
} from "@/lib/monthEndClose";
import type { PayrollLike } from "@/lib/monthlyFinancials";
import { useMonthEndCloses, useSaveMonthEndClose } from "@/hooks/useMonthEndClose";
import { useRecordPayroll } from "@/hooks/useExpenseImport";

const STATUS_LABEL: Record<ItemStatus, string> = { todo: "To do", done: "Done", waiting: "Waiting for info", skipped: "Skipped (not available)" };

interface Props {
  periodMonth: string; // yyyy-MM-01
  locations: { id: string; name: string }[];
  payroll: PayrollLike[];
  factsFor: (locationId: string) => DetectedFacts;
}

export function MonthEndChecklist({ periodMonth, locations, payroll, factsFor }: Props) {
  const { data: closes = [], isLoading } = useMonthEndCloses(periodMonth);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4" /> Month-end completion</CardTitle>
        <p className="text-xs text-muted-foreground">Work through each location at your own pace — progress is saved per item. Profit stays provisional until the month is confirmed with confirmed payroll.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading checklist…</p>}
        {locations.map((loc) => (
          <LocationClose key={loc.id} periodMonth={periodMonth} location={loc}
            record={closes.find((c) => c.location_id === loc.id) ?? null}
            payroll={payroll.find((p) => p.location_id === loc.id && p.status === "active") ?? null}
            facts={factsFor(loc.id)} />
        ))}
      </CardContent>
    </Card>
  );
}

function LocationClose({ periodMonth, location, record, payroll, facts }: {
  periodMonth: string; location: { id: string; name: string };
  record: ReturnType<typeof useMonthEndCloses>["data"] extends (infer R)[] | undefined ? R | null : never;
  payroll: PayrollLike | null; facts: DetectedFacts;
}) {
  const save = useSaveMonthEndClose();
  const recordPayroll = useRecordPayroll();
  const [payrollInput, setPayrollInput] = useState("");
  const [reason, setReason] = useState("");
  const state = deriveCloseState(record, facts);
  const confirmed = state === "confirmed";
  const guidance = monthEndGuidance(record, facts);

  const setItem = (key: string, status: ItemStatus, note?: string | null) => {
    const err = validateItemChange(key, status);
    if (err) return;
    save.mutate({ locationId: location.id, periodMonth, action: "save", itemKey: key, status, note: note ?? record?.items[key]?.note ?? null });
  };

  const submitPayroll = () => {
    const amount = Number(payrollInput);
    if (!Number.isFinite(amount) || amount <= 0) return;
    recordPayroll.mutate({
      locationId: location.id, periodMonth, amount, scope: "gross_wages",
      replaceId: payroll?.id ?? null, reason: payroll ? "Corrected monthly payroll total" : null,
    }, { onSuccess: () => { setPayrollInput(""); setItem("payroll", "done"); } });
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{location.name}</h3>
        <Badge variant={confirmed ? "default" : "outline"}>{CLOSE_STATE_LABELS[state]}</Badge>
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-md bg-muted/40 p-2">
        <div className="text-xs">
          <div className="text-muted-foreground">Monthly payroll total</div>
          <div className="font-medium">{payroll ? `${formatCurrency(payroll.amount)} (confirmed)` : "Not entered"}</div>
        </div>
        {!confirmed && (
          <>
            <Input type="number" inputMode="decimal" min="0" step="0.01" className="h-11 w-36"
              placeholder={payroll ? "Correct total €" : "Total wages €"} value={payrollInput}
              onChange={(e) => setPayrollInput(e.target.value)} aria-label={`Monthly payroll total for ${location.name}`} />
            <Button type="button" className="h-11" onClick={submitPayroll} disabled={recordPayroll.isPending || !(Number(payrollInput) > 0)}>
              {payroll ? "Save correction" : "Save payroll"}
            </Button>
            <Button asChild variant="ghost" className="h-11"><Link to="/settings/financial/overheads">Upload statement</Link></Button>
          </>
        )}
      </div>

      <ul className="space-y-2">
        {MONTH_END_ITEMS.map((def) => {
          const st = itemStatus(def.key, record?.items ?? {}, facts);
          return (
            <li key={def.key} className="flex flex-wrap items-center gap-2">
              {st === "done" ? <CheckCircle2 className="h-4 w-4 text-success" /> : <span className="h-4 w-4 rounded-full border" />}
              <span className="min-w-[12rem] flex-1 text-sm">{def.label}</span>
              <Select value={st} disabled={confirmed} onValueChange={(v) => setItem(def.key, v as ItemStatus)}>
                <SelectTrigger className="h-11 w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["todo", "done", "waiting", "skipped"] as ItemStatus[])
                    .filter((s) => s !== "skipped" || def.skippable)
                    .map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input className="h-11 w-48" placeholder="Note (optional)" disabled={confirmed}
                defaultValue={record?.items[def.key]?.note ?? ""}
                onBlur={(e) => { if ((e.target.value || "") !== (record?.items[def.key]?.note ?? "")) setItem(def.key, st, e.target.value); }} />
            </li>
          );
        })}
      </ul>

      {guidance.length > 0 && (
        <div className="mt-3 space-y-1 text-xs">
          <div className="font-medium text-muted-foreground">Still needed</div>
          {guidance.map((g) => (
            <div key={g.key} className="flex flex-wrap items-center gap-2">
              <span>{g.label} — {g.why}</span>
              <Link to={g.route} className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">
                Open {g.formLabel} <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!confirmed ? (
          <Button type="button" className="h-11" disabled={!canConfirm(record, facts) || save.isPending}
            onClick={() => save.mutate({ locationId: location.id, periodMonth, action: "confirm" })}>
            <Lock className="mr-1 h-4 w-4" /> Confirm month
          </Button>
        ) : (
          <>
            <Input className="h-11 w-64" placeholder="Reason to reopen" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button type="button" variant="outline" className="h-11" disabled={!reason.trim() || save.isPending}
              onClick={() => save.mutate({ locationId: location.id, periodMonth, action: "reopen", reason }, { onSuccess: () => setReason("") })}>
              <Unlock className="mr-1 h-4 w-4" /> Reopen
            </Button>
          </>
        )}
        {state === "ready_for_review" && <span className="text-xs text-muted-foreground">All items done or skipped — review the figures above, then confirm.</span>}
      </div>
    </div>
  );
}
