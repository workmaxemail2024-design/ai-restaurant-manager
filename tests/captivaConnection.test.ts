import { describe, it, expect } from "bun:test";
import { captivaConnectionView, type CaptivaSourceRow } from "../src/lib/captivaConnection";

const now = new Date("2026-11-19T21:00:00Z");
const src = (loc: string, store: string, coverage: string, o: Partial<CaptivaSourceRow> = {}): CaptivaSourceRow => ({
  location_id: loc, store_id: store, trading_date: "2026-11-17", journal_coverage: coverage,
  reconciliation_state: "unverified", observed_at: "2026-11-19T14:15:24Z", ...o,
});
// Live state: three bound stores, one staged day each, no approvals, only one legacy settings row (ignored).
const live = [src("rudys", "01584", "complete"), src("max", "02137", "complete"), src("gpf", "02136", "dashboard_only")];

describe("Captiva connection overview", () => {
  it("all three stores show Connected with their own store code, without a legacy row", () => {
    const views = ["rudys", "max", "gpf"].map((l) => captivaConnectionView({ sources: live.filter((s) => s.location_id === l), now }));
    expect(views.map((v) => v.headline)).toEqual(["Connected with Captiva", "Connected with Captiva", "Connected with Captiva"]);
    expect(views.map((v) => v.storeCode)).toEqual(["01584", "02137", "02136"]);
  });
  it("staged but unapproved is never shown as applied sales", () => {
    const v = captivaConnectionView({ sources: [live[0]], now });
    expect(v.sales).toContain("not yet applied");
  });
  it("approved without booked summary is still not applied", () => {
    const v = captivaConnectionView({ sources: [live[0]], approvedSourceIds: new Set(["s1"]), latestSourceId: "s1", latestApplied: false, now });
    expect(v.sales).toBe("Approved, sales not yet applied");
  });
  it("dashboard-only coverage is called out", () => {
    expect(captivaConnectionView({ sources: [live[2]], now }).coverage).toBe("Dashboard totals only — no payments journal");
  });
  it("reconciliation stays unverified and auto sync is never claimed", () => {
    const v = captivaConnectionView({ sources: [live[1]], now });
    expect(v.reconciliation).toBe("Reconciliation: unverified");
    expect(v.autoSync).toContain("not verified");
  });
  it("no evidence means not connected", () => {
    expect(captivaConnectionView({ sources: [], now }).link).toBe("none");
  });
  it("old evidence is stale, not connected", () => {
    expect(captivaConnectionView({ sources: [src("max", "02137", "complete", { observed_at: "2026-11-01T00:00:00Z" })], now }).link).toBe("stale");
  });
  it("uses the newest trading day", () => {
    const v = captivaConnectionView({ sources: [live[1], src("max", "02137", "complete", { trading_date: "2026-11-18" })], now });
    expect(v.latestTradingDate).toBe("2026-11-18");
    expect(v.stagedDays).toBe(2);
  });
});
