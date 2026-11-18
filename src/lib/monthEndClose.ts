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
  confirmed_by?: string | null;
  confirmation_skipped?: string[] | null;
  confirmation_limitations?: string | null;
}

/**
 * Facts detected from existing data — shown as hints only. Nothing is ever
 * marked Done automatically: imported sales are evidence, not verification.
 */
export interface DetectedFacts {
  /** Days in the month with any POS import for this location (deduplicated by date). */
  salesDays: number;
  /** Calendar days in the month up to today (or the whole month once it has ended). */
  tradingDaysExpected: number;
  /** Days with both the Sales Summary and the Products Sold report. */
  fullDetailDays?: number;
  payrollConfirmed: boolean;
  expensesRecorded: boolean;
}

/** Plain-language coverage line for the Sales item, e.g. "POS data for 28 of 31 days (25 with product detail)". */
export function salesCoverageText(f: DetectedFacts): string {
  if (f.tradingDaysExpected <= 0) return "No days to check yet";
  const detail = f.fullDetailDays != null ? ` (${f.fullDetailDays} with both summary and product detail)` : "";
  return `POS data for ${f.salesDays} of ${f.tradingDaysExpected} days${detail} — check closed days and totals before marking Done`;
}

/** Hint text per item; never changes the saved status. */
export function itemHint(key: string, f?: DetectedFacts): string | null {
  if (!f) return null;
  if (key === "sales") return salesCoverageText(f);
  if (key === "payroll") return f.payrollConfirmed ? "Confirmed payroll is recorded for this month" : "No confirmed payroll yet";
  if (key === "expenses") return f.expensesRecorded ? "Bills are recorded for this month" : "No bills recorded yet";
  return null;
}

/** Status is what the user saved — detected facts never tick items for them. */
export function itemStatus(key: string, items: SavedItems, _facts?: DetectedFacts): ItemStatus {
  return items[key]?.status ?? "todo";
}

export function deriveCloseState(record: CloseRecord | null, _facts?: DetectedFacts): CloseState {
  if (record?.confirmed_at) return "confirmed";
  const items = record?.items ?? {};
  const statuses = MONTH_END_ITEMS.map((d) => itemStatus(d.key, items));
  if (statuses.some((s) => s === "waiting")) return "waiting";
  if (statuses.every((s) => s === "done" || s === "skipped")) return "ready_for_review";
  if (statuses.every((s) => s === "todo")) return "not_started";
  return "in_progress";
}

export function canConfirm(record: CloseRecord | null, _facts?: DetectedFacts): boolean {
  return deriveCloseState(record) === "ready_for_review";
}

/** Skipping these leaves money out of the month's figures. */
export const FINANCIAL_ITEM_KEYS = ["payroll", "supplier_invoices", "expenses", "overheads", "stock_count"] as const;

export interface ConfirmationReview {
  skipped: string[];
  financialSkipped: string[];
  /** True when the confirmer must acknowledge skipped financial information and describe limitations. */
  needsAcknowledgement: boolean;
}

export function confirmationReview(record: CloseRecord | null): ConfirmationReview {
  const items = record?.items ?? {};
  const skipped = MONTH_END_ITEMS.filter((d) => items[d.key]?.status === "skipped").map((d) => d.key);
  const financialSkipped = skipped.filter((k) => (FINANCIAL_ITEM_KEYS as readonly string[]).includes(k));
  return { skipped, financialSkipped, needsAcknowledgement: financialSkipped.length > 0 };
}

/** Mirrors the server rule in save_month_end_close('confirm'). */
export function validateConfirmation(record: CloseRecord | null, input: { canEdit: boolean; acknowledged: boolean; limitations: string }): string | null {
  if (!input.canEdit) return "Only the Owner or someone with Finance Edit permission can confirm a month";
  if (!canConfirm(record)) return "Every item must be Done or Skipped first";
  const r = confirmationReview(record);
  if (r.needsAcknowledgement) {
    if (!input.acknowledged) return "Acknowledge that skipped financial information is missing from this month";
    if (!input.limitations.trim()) return "Describe the limitations of this month's figures";
  }
  return null;
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
    .map((d) => ({ d, s: itemStatus(d.key, items) }))
    .filter(({ s }) => s === "todo" || s === "waiting")
    .map(({ d, s }) => ({ key: d.key, label: d.label, status: s, why: d.why, route: d.route, formLabel: d.formLabel, note: items[d.key]?.note ?? null }));
}
