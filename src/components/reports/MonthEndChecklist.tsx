import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ClipboardList, ExternalLink, Lock, Unlock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { usePermissions } from "@/hooks/usePermissions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/currency";
import {
  CLOSE_STATE_LABELS, MONTH_END_ITEMS, confirmationReview, deriveCloseState, itemHint, itemStatus, monthEndGuidance, validateConfirmation, validateItemChange,
  type DetectedFacts, type ItemStatus,
} from "@/lib/monthEndClose";
import type { PayrollLike } from "@/lib/monthlyFinancials";
import { useMonthEndCloseEvents, useMonthEndCloses, useSaveMonthEndClose, type MonthEndCloseEvent } from "@/hooks/useMonthEndClose";

const itemLabel = (k: string) => MONTH_END_ITEMS.find((d) => d.key === k)?.label ?? k;
const when = (iso: string) => format(new Date(iso), "d MMM yyyy, HH:mm");
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
  const { data: events = [] } = useMonthEndCloseEvents(periodMonth);
  const { hasPermission, hasFullAccess } = usePermissions();
  const canEdit = hasFullAccess() || hasPermission("finance", "edit");
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
            facts={factsFor(loc.id)} canEdit={canEdit}
            events={events.filter((e) => e.location_id === loc.id)} />
        ))}
      </CardContent>
    </Card>
  );
}

function LocationClose({ periodMonth, location, record, payroll, facts, canEdit, events }: {
  periodMonth: string; location: { id: string; name: string };
  record: ReturnType<typeof useMonthEndCloses>["data"] extends (infer R)[] | undefined ? R | null : never;
  payroll: PayrollLike | null; facts: DetectedFacts; canEdit: boolean; events: MonthEndCloseEvent[];
}) {
  const [reviewing, setReviewing] = useState(false);
  const [ack, setAck] = useState(false);
  const [limitations, setLimitations] = useState("");
  const review = confirmationReview(record);
  const confirmError = validateConfirmation(record, { canEdit, acknowledged: ack, limitations });
  const save = useSaveMonthEndClose();
  const recordPayroll = useRecordPayroll();
  const [payrollInput, setPayrollInput] = useState("");
  const [reason, setReason] = useState("");
  const state = deriveCloseState(record);
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
        {!confirmed && canEdit && (
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
              <span className="min-w-[12rem] flex-1 text-sm">{def.label}
                {itemHint(def.key, facts) && <span className="block text-xs text-muted-foreground">{itemHint(def.key, facts)}</span>}
              </span>
              <Select value={st} disabled={confirmed || !canEdit} onValueChange={(v) => setItem(def.key, v as ItemStatus)}>
                <SelectTrigger className="h-11 w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["todo", "done", "waiting", "skipped"] as ItemStatus[])
                    .filter((s) => s !== "skipped" || def.skippable)
                    .map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input className="h-11 w-48" placeholder="Note (optional)" disabled={confirmed || !canEdit}
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

      {confirmed && record?.confirmed_at && (
        <div className="mt-3 rounded-md bg-muted/40 p-2 text-xs">
          <div>Confirmed {when(record.confirmed_at)}{events.find((e) => e.action === "confirm")?.actor_name ? ` by ${events.find((e) => e.action === "confirm")?.actor_name}` : ""}</div>
          {!!record.confirmation_skipped?.length && <div className="text-warning">Skipped: {record.confirmation_skipped.map(itemLabel).join(", ")}</div>}
          {record.confirmation_limitations && <div>Limitations: {record.confirmation_limitations}</div>}
        </div>
      )}

      {reviewing && !confirmed && (
        <div className="mt-3 space-y-2 rounded-md border border-warning/50 p-3 text-sm">
          <div className="font-medium">Review before confirming {location.name}</div>
          {review.skipped.length === 0
            ? <p className="text-muted-foreground">No items were skipped.</p>
            : <p>Skipped: {review.skipped.map(itemLabel).join(", ")}</p>}
          {review.needsAcknowledgement && (
            <>
              <p className="text-warning">Skipped financial information is missing from this month: {review.financialSkipped.map(itemLabel).join(", ")}. Profit may be overstated.</p>
              <label className="flex min-h-11 items-center gap-3"><Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="h-6 w-6" />I understand these figures are incomplete</label>
              <Textarea placeholder="Limitations (e.g. stock count not done; supplier invoices from X missing)" value={limitations} onChange={(e) => setLimitations(e.target.value)} />
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="h-11" disabled={!!confirmError || save.isPending}
              onClick={() => save.mutate({ locationId: location.id, periodMonth, action: "confirm", acknowledgeSkipped: ack, limitations },
                { onSuccess: () => { setReviewing(false); setAck(false); setLimitations(""); } })}>
              <Lock className="mr-1 h-4 w-4" /> Confirm month
            </Button>
            <Button type="button" variant="ghost" className="h-11" onClick={() => setReviewing(false)}>Cancel</Button>
          </div>
          {confirmError && <p className="text-xs text-muted-foreground">{confirmError}</p>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!canEdit ? (
          <span className="text-xs text-muted-foreground">Only the Owner or someone with Finance Edit permission can change or confirm this month.</span>
        ) : !confirmed ? (
          !reviewing && (
            <Button type="button" className="h-11" disabled={state !== "ready_for_review"} onClick={() => setReviewing(true)}>
              <Lock className="mr-1 h-4 w-4" /> Review & confirm
            </Button>
          )
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

      {events.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer py-2 text-muted-foreground">History ({events.length})</summary>
          <ul className="space-y-1">
            {events.map((e) => (
              <li key={e.id}>
                {when(e.created_at)} · {e.action === "confirm" ? "Confirmed" : "Reopened"}{e.actor_name ? ` by ${e.actor_name}` : ""}
                {e.reason ? ` — ${e.reason}` : ""}
                {e.skipped_items?.length ? ` · skipped: ${e.skipped_items.map(itemLabel).join(", ")}` : ""}
                {e.limitations ? ` · limitations: ${e.limitations}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
