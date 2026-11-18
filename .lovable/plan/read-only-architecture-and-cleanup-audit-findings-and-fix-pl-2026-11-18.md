# Read-only architecture and cleanup audit: findings and fix plan

I traced this audit through the code only. I changed nothing, ran no live database queries and made no requests while signed in. "Verified" means the code path is confirmed. "Suspected" means it still needs a check against the data or the database.

## Findings by priority

### P1: Money and counts (verified)
1. **Manual order/cover corrections are grouped by date, not by date and location.** In `src/hooks/useDashboardOverview.ts:122-154`, a correction for one location replaces the combined POS total for every location on that date when "All locations" is selected. The same code also ignores manual covers of 0 (`:124`) and never reads `covers_unknown` (`:134`).
2. **Reports and the dashboard apply corrections differently.** In "All locations" view, Reports reads only ledger rows with no location (`src/hooks/useDailyLedger.ts:129-140`). Period totals never apply manual order corrections to days that have POS data (`ReportsPage.tsx:1424-1449`).
3. **Hourly charts bucket by `created_at` (import time).** See `useDashboardOverview.ts:168-190` and `SalesDashboardPage.tsx:79-88`. The `sales` table has no time-of-sale column (`types.ts:2581-2593`), so imported days pile into the import hour. Sales before 06:00 are also folded into 06:00.
4. **The same KPIs have four competing definitions.** These are `useDashboardOverview`, `useDailyFinancialSummary`, `useLocationRevenue` and `useDailyBreakdown`. One reads canonical POS gross, the others sum `sales.total_price`, and manual corrections are treated differently. As a result, a day imported as a summary only can show revenue in Reports and none on the Dashboard.
5. **Monthly P&L undercosts food.** It uses `dishSales.length` as the quantity (`useFinancialReports.ts:80-85`), so any product row with a quantity above 1 is undercosted.
6. **"Orders" means three different things.** It is receipts (dashboard headline), sales rows (hourly chart) and summed quantity (location performance in `useDailyBreakdown.ts:314-316`).

### P1: Unknown values shown as zero (verified)
- Dashboard revenue: `|| 0` in `useDashboardOverview.ts:101-103`.
- Daily financial summary revenue and covers: `useDailyFinancialSummary.ts:80,108`. Missing hourly rates count as €0 labour (`:140-146`). Recipe cost: `Number(x)||0` (`:191-197`).
- Ledger covers, labour and expenses default to 0 (`useDailyLedger.ts:144-146`).
- Reports shows unknown food-cost % and labour % as 0 (`ReportsPage.tsx:589,599`).
- Monthly P&L treats missing recipe cost and missing pay rate as 0 (`useFinancialReports.ts:82-85,103-107`).

### P1: Possible double-counted revenue (suspected, code path confirmed)
- The Captiva API (`captiva`) and XLS (`captiva_xls`) paths dedupe by provider-specific IDs. XLS cleanup deletes only its own source (`CaptivaXLSImportDialog.tsx:1080-1089`). Importing the same day both ways would leave two copies in `sales`.
- Dashboard sales queries do not filter by source.
- Report readers do pick one canonical row, so the risk is on the Dashboard and in sales-based screens.
- To confirm, compare `sales` grouped by location, date and source against the live data (read-only).

### P2: Navigation and dead code (verified by import tracing)
- The app renders `PermissionFilteredSidebar`. The legacy `src/components/dashboard/Sidebar.tsx` has no importers, plus an inert Sign Out button and a `#` link for Notifications.
- `src/pages/SalesDashboardPage.tsx`, `src/pages/POSSyncLogsPage.tsx` and `src/components/NavLink.tsx` have no importers.
- **Broken links:**
  - AI Insights links to `/ai/menu-engineering` (should be `/menu/engineering`, `AIInsightsPage.tsx:354`).
  - Two AI Insights links go to `/cost-analysis` (should be `/menu/cost-analysis`, `:371,388`).
  - Data-coverage warnings link to `/attendance` (should be `/staff/attendance`, `useDataCoverage.ts:224-230,275-281`).
- `/settings/system-qa` and `/settings/demo` have routes but no sidebar entry. This is probably intentional.
- **Overlapping screens (suspected; product decision):** Menu Engineering vs Chain Menu Performance.

### P2: Location scoping
- `ChainMenuPerformancePage.tsx:87-92` calls `useSales` without a location. The route is wrapped in `RequireAllLocations`, so the impact depends on that guard (suspected).
- `LocationContext.tsx:35-54` restores or saves any location ID without checking it against the user's allowed locations. RLS still guards the data (suspected stale or foreign selection).
- The query keys in `useStock.ts:18` and `useStaff.ts:98` leave out the restaurant ID, so the cache could show the previous restaurant's data after switching (suspected).

### P3: Tenant, inventory, staff, reservations
- **Tenant/RLS:** Old `USING (true)` policies were dropped later. Current unrestricted policies are for `service_role` only. The service-role edge functions I inspected all check membership. No cross-tenant exploit found.
- Inserts without `restaurant_id`: `useStaff.ts:144-152` and `useDishes.ts:197-212`. These depend on database defaults or triggers (verify live).
- `staff_safe` and `pos_integrations_safe` check the restaurant only, not the location (suspected; confirm this is intended).
- **Inventory:** Only the demo-data function writes `stock_levels` directly (`demo-data/index.ts:349-357`). It is limited to admins and behind a flag. Normal edits go through the stock ledger.
- **Menus:** One hard-coded drinks list remains (`DishCategorySection.tsx:26-27`). Category pickers otherwise use `dish_categories`.
- **Staff:** Salary is allocated correctly (annual / 365). Reports and Dashboard read pay directly from the base `staff` table. RLS restricts this to admins, so non-admins may get blank values rather than masked ones (suspected functional issue).
- **Reservations:** All nine statuses exist. `inquiry` has no next actions (`useReservations.ts:483-508`; product decision). Conflicts correctly exclude cancelled, declined and no-show bookings.

## Suggested fix packages (each needs separate approval)

1. **Dashboard corrections by location (P1, frontend only).** Group manual overrides by location and date. Replace only that location's POS contribution. Respect explicit 0 and `covers_unknown`. Align with Reports' daily logic.
2. **One KPI source (P1).** Route `useDailyFinancialSummary` and `useLocationRevenue` through the same canonical POS resolver Reports uses, with the same manual-correction rule.
3. **Unknown ≠ 0 (P1).** Return `null` and show "Unknown" with reasons for the coercions listed above. Keep the guards against dividing by zero.
4. **Fix P&L quantity (P1).** Sum `quantity` instead of counting rows.
5. **Hourly chart (P1).** Hide or label it "Not available" for imported days until real sale times exist. Adding a sale-time column would be a schema change, proposed separately.
6. **Dedupe across POS sources (P1, after read-only confirmation).** Choose one source per location and day for sales-based screens. This ties in with the earlier package for one shared server-side POS apply.
7. **Navigation cleanup (P2).** Fix the four broken links. Remove the legacy Sidebar, `SalesDashboardPage`, `POSSyncLogsPage` and `NavLink` after one more import check.
8. **Scoping hardening (P2).** Pass the location in Chain Menu Performance or confirm the guard. Validate the saved location against the user's allowed locations. Add the restaurant ID to the stock and staff query keys.
9. **Product decisions (P3).** Next actions for inquiry bookings, the hard-coded drinks list, and overlapping menu screens.

## Tests to add (next to existing tests)
- Override by location: A has a manual correction of 10 and B has POS 7, so "All locations" shows 17, not 10.
- An explicit manual 0 covers overrides the POS figure. `covers_unknown` shows Unknown.
- Missing recipe cost or pay rate gives `null` or Unknown, never €0.
- P&L food cost uses the summed quantity (one row with quantity 3 costs 3x).
- API and XLS rows for the same location and day count revenue once.
- All four corrected links resolve to registered routes.

## Read-only checks still needed before building
- Live data: whether both `captiva` and `captiva_xls` rows exist in `sales` for the same location and day.
- The live `sales.created_at` default.
- Live defaults or triggers that fill in `restaurant_id` for `staff` and `dish_ingredients`.
- How `RequireAllLocations` behaves.
