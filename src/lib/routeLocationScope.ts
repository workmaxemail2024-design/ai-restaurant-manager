// How each signed-in page uses the header location, so the shared location bar never
// claims a page is filtered when it is not.
//  - "location":   page data follows the selected location (or All locations)
//  - "all":        page always compares every location (owner-only chain views)
//  - "restaurant": page shows restaurant-wide records; the location choice is kept but not applied
//  - "page":       page starts from the header location and has its own filter
export type RouteLocationScope = "location" | "all" | "restaurant" | "page";

export const ROUTE_LOCATION_SCOPE: Record<string, RouteLocationScope> = {
  "/": "location",
  "/locations": "all",
  "/suppliers": "restaurant",
  "/ingredients": "restaurant",
  "/stock": "location",
  "/dishes": "location",
  "/purchase-orders": "location",
  "/sales": "location",
  "/operations/documents": "location",
  "/reports": "location",
  "/staff": "location",
  "/staff/shifts": "location",
  "/staff/attendance": "location",
  "/staff/kpis": "restaurant",
  "/menu/cost-analysis": "page",
  "/menu/engineering": "location",
  "/inventory/forecast": "location",
  "/ai/insights": "location",
  "/ai/assistant": "location",
  "/ai/daily-summary": "location",
  "/ai/scheduling": "location",
  "/analytics/multi-location": "all",
  "/analytics/menu-performance": "all",
  "/analytics/forecast": "location",
  "/analytics/product-intelligence": "location",
  "/automation/rules": "restaurant",
  "/notifications": "restaurant",
  "/reservations": "location",
  "/reservations/floor": "page",
  "/reservations/customers": "restaurant",
  "/reservations/settings": "location",
  "/settings/pos": "page",
  "/settings/roles": "restaurant",
  "/settings/audit-log": "restaurant",
  "/settings/system-qa": "location",
  "/settings/financial/overheads": "restaurant",
  "/settings/demo": "restaurant",
  "/settings/backups": "restaurant",
};

export function routeLocationScope(pathname: string): RouteLocationScope {
  return ROUTE_LOCATION_SCOPE[pathname] ?? "location";
}

export function locationBarNote(scope: RouteLocationScope): string | null {
  switch (scope) {
    case "all": return "This page always shows all locations";
    case "restaurant": return "Whole restaurant — not filtered by location";
    case "page": return "This page also has its own location filter";
    default: return null;
  }
}
