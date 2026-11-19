import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { ROUTE_LOCATION_SCOPE, routeLocationScope } from "../src/lib/routeLocationScope";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const protectedPaths = [...app.matchAll(/path="([^"]+)" element=\{<ProtectedRoute>/g)].map((m) => m[1]);
const allOnly = [...app.matchAll(/path="([^"]+)" element=\{<ProtectedRoute><RequireAllLocations>/g)].map((m) => m[1]);

describe("location bar route coverage", () => {
  it("the shared bar is rendered by ProtectedRoute", () => {
    expect(app).toMatch(/<AppLocationBar \/>\s*<PageAccessGuard>/);
  });
  it("every signed-in route has a declared location scope", () => {
    expect(protectedPaths.length).toBeGreaterThan(30);
    expect(protectedPaths.filter((p) => !(p in ROUTE_LOCATION_SCOPE))).toEqual([]);
  });
  it("all-locations-only routes are labelled All locations", () => {
    expect(allOnly.map(routeLocationScope)).toEqual(allOnly.map(() => "all"));
  });
});
