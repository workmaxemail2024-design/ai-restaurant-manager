// Per-restaurant Captiva status built from backend staging evidence (pos_captiva_daily_sources),
// not the legacy per-location API settings row. Read-only and conservative:
// "linked" needs recent staged evidence; automatic sync and applied sales are separate facts.
export interface CaptivaSourceRow {
  location_id: string;
  store_id: string | null;
  trading_date: string;
  journal_coverage: string | null;
  reconciliation_state: string | null;
  observed_at: string;
}

export type CaptivaLink = "connected" | "stale" | "none";

export interface CaptivaConnectionView {
  link: CaptivaLink;
  headline: string;
  storeCode: string | null;
  latestTradingDate: string | null;
  lastReceivedAt: string | null;
  coverage: string;
  reconciliation: string;
  sales: string;
  autoSync: string;
  stagedDays: number;
}

const STALE_DAYS = 7;

export function captivaConnectionView(input: {
  sources: CaptivaSourceRow[]; // this location's staged rows, any order
  approvedSourceIds?: Set<string>;
  latestApplied?: boolean; // an approved day also has a booked POS daily summary
  latestSourceId?: string;
  now?: Date;
}): CaptivaConnectionView {
  const rows = [...input.sources].sort((a, b) => (a.trading_date < b.trading_date ? 1 : a.trading_date > b.trading_date ? -1 : 0));
  const latest = rows[0];
  const autoSync = "Automatic daily sync: not verified — runs on the Captiva backend; ingestion stays paused until you switch it on";
  if (!latest) {
    return {
      link: "none", headline: "No Captiva data received yet", storeCode: null, latestTradingDate: null, lastReceivedAt: null,
      coverage: "—", reconciliation: "—", sales: "No Captiva sales applied", autoSync, stagedDays: 0,
    };
  }
  const now = input.now ?? new Date();
  const ageDays = (now.getTime() - Date.parse(latest.observed_at)) / 86_400_000;
  const link: CaptivaLink = ageDays <= STALE_DAYS ? "connected" : "stale";
  const approved = !!input.latestSourceId && !!input.approvedSourceIds?.has(input.latestSourceId);
  const coverage = latest.journal_coverage === "complete"
    ? "Payments journal complete"
    : latest.journal_coverage === "dashboard_only"
      ? "Dashboard totals only — no payments journal"
      : `Coverage: ${latest.journal_coverage ?? "unknown"}`;
  const rec = latest.reconciliation_state ?? "unverified";
  return {
    link,
    headline: link === "connected" ? "Connected with Captiva" : `Captiva data received — nothing new for ${Math.floor(ageDays)} days`,
    storeCode: latest.store_id,
    latestTradingDate: latest.trading_date,
    lastReceivedAt: latest.observed_at,
    coverage,
    reconciliation: rec === "unverified" ? "Reconciliation: unverified" : `Reconciliation: ${rec.replace(/_/g, " ")}`,
    sales: input.latestApplied && approved
      ? "Sales applied for the latest day"
      : approved ? "Approved, sales not yet applied" : "Staged — sales not yet applied (not counted as revenue)",
    autoSync,
    stagedDays: rows.length,
  };
}
