import { describe, it, expect } from "bun:test";
import { scopeByLocation } from "../src/lib/locationFilter";
import { classifyLocationActivity, captivaStagedLabel } from "../src/lib/locationActivity";

// The live restaurant has five location records: three operating, two quiet.
const LOCS = ["gpf", "max", "rudys", "rudys_restaurant", "taste"];
const shifts = LOCS.flatMap((l, i) => [{ id: `${l}-1`, location_id: l }, { id: `${l}-2`, location_id: l }]);

describe("selected-location isolation (5 locations)", () => {
  it("one location returns only its own rows", () => {
    for (const l of LOCS) expect(scopeByLocation(shifts, l).every((s) => s.location_id === l)).toBe(true);
    expect(scopeByLocation(shifts, "max")).toHaveLength(2);
  });
  it("All locations returns all five locations' rows", () => {
    expect(new Set(scopeByLocation(shifts, null).map((s) => s.location_id)).size).toBe(5);
  });
  it("unknown location id returns nothing, never another location's data", () => {
    expect(scopeByLocation(shifts, "other-restaurant")).toEqual([]);
  });
});

describe("location activity", () => {
  it("sales or POS days = trading", () => {
    expect(classifyLocationActivity({ sales: 121, summaries: 1, staged: 1, integrations: 1 })).toBe("trading");
    expect(classifyLocationActivity({ sales: 0, summaries: 3, staged: 0, integrations: 0 })).toBe("trading");
  });
  it("staged-only is not trading", () => {
    expect(classifyLocationActivity({ sales: 0, summaries: 0, staged: 1, integrations: 0 })).toBe("setup_only");
  });
  it("nothing = no activity", () => {
    expect(classifyLocationActivity({ sales: 0, summaries: 0, staged: 0, integrations: 0 })).toBe("no_activity");
  });
});

describe("Captiva staging status", () => {
  it("unapproved staged total says it is not counted as revenue", () => {
    expect(captivaStagedLabel({ reconciliation_state: null }, false)).toContain("not counted as revenue");
  });
  it("approved still needs apply", () => {
    expect(captivaStagedLabel({ reconciliation_state: "matched" }, true)).toContain("only once applied");
  });
});

import { readFileSync } from "fs";
describe("staged Captiva never booked as revenue", () => {
  it("dashboard/report revenue loaders never read staging tables", () => {
    for (const f of ["canonicalRevenueLoader.ts", "revenueTruth.ts", "reportsMonthly.ts"]) {
      const src = readFileSync(new URL(`../src/lib/${f}`, import.meta.url), "utf8");
      expect(/from\(["']pos_captiva_/.test(src)).toBe(false);
    }
  });
});
