/**
 * Month-end financial completion workflow (per location + month).
 *
 * Items are saved one by one (todo / done / waiting / skipped) so users can
 * leave and return. The overall state is DERIVED, never typed in:
 *   Not Started → In Progress → Waiting for Information → Ready for Review → Confirmed
 * "Confirmed" is only possible from Ready for Review and is stored server-side
 * by `save_month_end_close` (Owner / Finance Edit only).
 *
 * `monthEndGuidance` is the read-only contract for a future AI assistant: it
 * lists missing steps, why they matter and which EXISTING form to open. The
 * assistant never writes financial records itself; the user completes forms.
 */

export type ItemStatus = "todo" | "done" | "waiting" | "skipped";
export type CloseState = "not_started" | "in_progress" | "waiting" | "ready_for_review" | "confirmed";

export const CLOSE_STATE_LABELS: Record<CloseState, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  waiting: "Waiting for Information",
  ready_for_review: "Ready for Review",
  confirmed: "Confirmed",
};

export interface ChecklistItemDef {
  key: string;
  label: string;
  why: string;
  /** Existing screen that completes this step. */
  route: string;
  formLabel: string;
  /** Whether the item can be skipped when unavailable. */
  skippable: boolean;
}

export const MONTH_END_ITEMS: ChecklistItemDef[] = [
  { key: "sales", label: "Sales imported for every trading day", why: "Revenue is the base for every percentage and profit figure.", route: "/reports", formLabel: "Reports → Daily Performance", skippable: false },
  { key: "payroll", label: "Monthly payroll total confirmed", why: "Confirmed payroll replaces estimated labour for the month.", route: "/settings/financial/overheads", formLabel: "Overheads → Expenses & payroll", skippable: true },
  { key: "supplier_invoices", label: "Supplier invoices entered", why: "Purchases drive actual food cost.", route: "/operations/documents", formLabel: "Documents → Supplier invoices", skippable: true },
  { key: "expenses", label: "Monthly bills recorded", why: "Real bills replace recurring estimates.", route: "/settings/financial/overheads", formLabel: "Overheads → Import expenses", skippable: true },
  { key: "overheads", label: "Recurring overheads reviewed", why: "Estimates still in use should be correct.", route: "/settings/financial/overheads", formLabel: "Overheads", skippable: true },
  { key: "stock_count", label: "Closing stock count submitted", why: "Needed for actual food cost (opening + purchases − closing).", route: "/stock", formLabel: "Stock → Stock count", skippable: true },
  { key: "daily_review", label: "Daily ledger reviewed (covers, closed days, notes)", why: "Missing covers or unreviewed days make KPIs incomplete.", route: "/reports", formLabel: "Reports → Daily Performance", skippable: true },
];

export interface SavedItem { status: ItemStatus; note?: string | null }
export type SavedItems = Record<string, SavedItem | undefined>;

export interface CloseRecord {
  items: SavedItems;
  confirmed_at: string | null;
}

/** Facts detected from existing data — suggestions only, never auto-confirmation. */
export interface DetectedFacts {
  salesDays: number;
  tradingDaysExpected: number;
  payrollConfirmed: boolean;
  expensesRecorded: boolean;
}

export function suggestedStatus(key: string, f: DetectedFacts): ItemStatus | null {
  if (key === "sales") return f.tradingDaysExpected > 0 && f.salesDays >= f.tradingDaysExpected ? "done" : null;
  if (key === "payroll") return f.payrollConfirmed ? "done" : null;
  if (key === "expenses") return f.expensesRecorded ? "done" : null;
  return null;
}

export function itemStatus(key: string, items: SavedItems, facts?: DetectedFacts): ItemStatus {
  const saved = items[key]?.status;
  if (saved) return saved;
  return (facts && suggestedStatus(key, facts)) || "todo";
}

export function deriveCloseState(record: CloseRecord | null, facts?: DetectedFacts): CloseState {
  if (record?.confirmed_at) return "confirmed";
  const items = record?.items ?? {};
  const statuses = MONTH_END_ITEMS.map((d) => itemStatus(d.key, items, facts));
  const touched = Object.values(items).some((i) => i && i.status !== "todo");
  if (statuses.some((s) => s === "waiting")) return "waiting";
  if (statuses.every((s) => s === "done" || s === "skipped")) return "ready_for_review";
  if (!touched && statuses.every((s) => s === "todo")) return "not_started";
  return "in_progress";
}

export function canConfirm(record: CloseRecord | null, facts?: DetectedFacts): boolean {
  return deriveCloseState(record, facts) === "ready_for_review";
}

/** Skipping is allowed only for skippable items. */
export function validateItemChange(key: string, status: ItemStatus): string | null {
  const def = MONTH_END_ITEMS.find((d) => d.key === key);
  if (!def) return "Unknown checklist item";
  if (status === "skipped" && !def.skippable) return `${def.label} cannot be skipped`;
  return null;
}

/** Profit is Confirmed only when the month is confirmed AND payroll is confirmed. */
export function profitStatus(state: CloseState, labourSource: string): "confirmed" | "provisional" {
  return state === "confirmed" && labourSource === "confirmed" ? "confirmed" : "provisional";
}

export interface GuidanceStep { key: string; label: string; status: ItemStatus; why: string; route: string; formLabel: string; note?: string | null }

/** Read-only list of outstanding steps for the user or an AI assistant. */
export function monthEndGuidance(record: CloseRecord | null, facts?: DetectedFacts): GuidanceStep[] {
  if (record?.confirmed_at) return [];
  const items = record?.items ?? {};
  return MONTH_END_ITEMS
    .map((d) => ({ d, s: itemStatus(d.key, items, facts) }))
    .filter(({ s }) => s === "todo" || s === "waiting")
    .map(({ d, s }) => ({ key: d.key, label: d.label, status: s, why: d.why, route: d.route, formLabel: d.formLabel, note: items[d.key]?.note ?? null }));
}
