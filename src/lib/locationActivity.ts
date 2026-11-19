// Read-only classification of location records by what data they hold, so test or
// duplicate records can be spotted without hiding or deleting anything by name.
export interface LocationActivityCounts { sales: number; summaries: number; staged: number; integrations: number }
export type LocationActivity = "trading" | "setup_only" | "no_activity";

export function classifyLocationActivity(c: LocationActivityCounts): LocationActivity {
  if (c.sales > 0 || c.summaries > 0) return "trading";
  if (c.staged > 0 || c.integrations > 0) return "setup_only";
  return "no_activity";
}

export const LOCATION_ACTIVITY_LABEL: Record<LocationActivity, string> = {
  trading: "Has sales data",
  setup_only: "No booked sales yet (POS set up or staged only)",
  no_activity: "No sales or POS data — check if this is a test record",
};

/** Captiva official totals are staged evidence only until approved and applied. */
export function captivaStagedLabel(row: { reconciliation_state: string | null }, approved: boolean): string {
  const rec = row.reconciliation_state ? row.reconciliation_state.replace(/_/g, " ") : "not checked";
  return approved
    ? `Approved — reconciliation: ${rec}. Counts as sales only once applied.`
    : `Staged, not applied — not counted as revenue. Reconciliation: ${rec}.`;
}
