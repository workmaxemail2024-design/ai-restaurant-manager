# Full system audit (read-only): current state vs Nov 18 audit, and staged plan

**Scope:** I checked the current code against the Nov 18 audit and ran one read-only database query on the access rules for the new Captiva tables. I changed nothing and ran no tests: there is no test command set up. I made no checks while signed in.

**Labels:** "Verified" means the code or the database confirms it. "Suspected" means the code allows it but the real data hasn't been checked. Nothing here has been shown to be production-ready.

## 1. Nov 18 findings: fixed vs outstanding

**Fixed (verified):**
- **Dashboard manual overrides:** applied per location and day, with explicit 0 and Unknown covers respected (`src/lib/revenueTruth.ts:63-91`, used in `useDashboardOverview.ts:133-143`).
- **Food cost in P&L:** now multiplies by summed quantity (`useFinancialReports.ts:84-90`, `revenueTruth.ts:99-109`).
- **Hourly chart:** the misleading chart based on `created_at` is disabled (`useDashboardOverview.ts:147-151`).
- **Dead code:** legacy Sidebar, `SalesDashboardPage`, `POSSyncLogsPage` and `NavLink` have been removed. The three broken links are fixed (`AIInsightsPage.tsx:354,371,388`, `useDataCoverage.ts:230,281`).
- **Chain Menu Performance:** now passes the selected location (`ChainMenuPerformancePage.tsx:92`).
- **Saved location:** checked against allowed locations after loading (`LocationContext.tsx:61-82`). There is a short window before that check finishes.
- **Stock/staff caches:** query keys include the restaurant and location (`useStock.ts:19`, `useStaff.ts:100`).
- **New staff and recipe lines:** saved with an explicit restaurant (`useStaff.ts:155`, `useDishes.ts:217`), with a database backstop that fills it in automatically.
- **Inquiry bookings:** now have actions: Confirm, Mark Pending and Decline (`useReservations.ts:483-490`).

**Partial or outstanding (verified):**
- **"All locations" in Reports:** still reads only ledger rows that have no location (`useDailyLedger.ts:129-133`), so corrections made per location are missed there. **High.**
- **Revenue source:** Dashboard, Daily Financial Summary and location cards sum `sales` (`useDashboardOverview.ts:109-114`, `useDailyFinancialSummary.ts:85-100`, `useLocationRevenue.ts:20-31`), while Reports uses canonical POS gross (`useDailyBreakdown.ts:256-261`). A day imported as a summary only shows revenue in Reports but not on the Dashboard. **High.**
- **Reports product detail:** skips the POS de-duplication. It doesn't select `source` (`useDailyBreakdown.ts:118-133,240-278`), so overlapping API and XLS rows inflate product totals (suspected). **High.**
- **Location performance:** "orders" is still summed item quantity (`useDailyBreakdown.ts:314-316`). **Med.**
- **Unknown shown as 0:**
  - Ledger covers, hours and expenses (`useDailyLedger.ts:144-146`).
  - Summed sales revenue (`revenueTruth.ts:45-48`, `useDailyFinancialSummary.ts:88`).
  - P&L food cost (`fc.cost ?? 0`, `useFinancialReports.ts:89-91`); staff with no pay rate are left out of labour.
  - Reports health colour (`labourPct ?? 0`, `ReportsPage.tsx:629`) and Reports profit when labour is missing (`:603`).
  - **High.**
- **Database rows for "covers unknown":** the helper only tests the single-location case. Mixing locations with known and unknown covers is untested. **Med.**
- **Pages with no sidebar link:** `/settings/system-qa`, `/settings/demo` and `/notifications` have no menu entry (`App.tsx:125,135,137`; product decision).
- **Overlapping menu analysis:** Menu Engineering, Chain Menu Performance, Cost Analysis and Product Intelligence overlap (suspected redundancy).
- **Drinks categories:** still hard-coded (`DishCategorySection.tsx:26-27`).
- **Demo data tool:** still writes stock directly (`demo-data/index.ts:182,357`). It is admin-only and switched off by a setting.

## 2. Daily surfaces and nav overlap (verified)
- **Dashboard `/`:** embeds `DailyControlCentre` (only a location and date picker, `DailyControlCentre.tsx:28-84`) and `DailyFinancialSummary`, which has its own revenue and cost logic (`Index.tsx:88,103`).
- **Daily Ledger:** has no page of its own; it lives inside Reports (`ReportsPage.tsx:1298`).
- **Daily breakdown:** shown in both Reports and Sales (`SalesPage.tsx:13,30`).
- **Result:** three places calculate a "day" in different ways. There is no single journal and profit view.

## 3. Revenue, VAT and costs
- **Canonical POS selection** (`revenueTruth.ts:17-42`, `posDailyCanonical.ts:99-115`) picks one Captiva source per location and day. Manual `sales` rows always pass through, so manual sales plus POS sales can double-count (suspected). **High.**
- **VAT:**
  - `sales` stores only `total_price`, which is gross (`types.ts:3733-3745`). Only `pos_daily_summaries` holds net and VAT.
  - Dashboard revenue, average order value, and the Daily Financial Summary food %, labour %, profit and margin are all on gross (`useDailyFinancialSummary.ts:88,187,220-223,315-317`). Reports' headline figure is also gross; net is shown separately (`ReportsPage.tsx:930`).
  - **No profit figure is calculated without VAT. High.**
- **Food cost:**
  - The daily figure is theoretical, or falls back to 30% of revenue when fewer than half the dishes are costed (`useDailyFinancialSummary.ts:9-11,189-223`).
  - Actual food cost (`get_period_actual_food_cost`) exists only in Reports (`ActualVsTheoreticalBlock.tsx:30-51`), and uses UTC day boundaries.
- **Labour:**
  - Salary is allocated as annual ÷ 365 (`labour.ts:7-16`).
  - Manual hours in the daily summary are never turned into a cost (`useDailyFinancialSummary.ts:159-185`). **High.**
  - The monthly salary estimate uses currently active staff for every month, ignoring start and end dates, and doesn't filter by restaurant (`useMonthlyFinancials.ts:68,94-106`). **Med.**
- **Expenses:**
  - The daily summary uses `daily_expenses`. It falls back to the ledger only if the whole scope has no expense rows, then adds overheads (`useDailyFinancialSummary.ts:266-313`).
  - It ignores `actual_expenses`, so real bills don't replace estimates in the daily view. **High.**
  - Monthly financials handle this correctly (`monthlyFinancials.ts:284-379`).
- **Overhead allocation** is approximate: monthly ÷ 30, quarterly ÷ 91, yearly ÷ 365 (`useOverheads.ts:75-90`).
- **True vs estimated profit:** Reports' "Est. Profit" leaves out overheads (`ReportsPage.tsx:603-604,762`); the daily summary includes them. The two definitions don't match. **Med.**

## 4. New Captiva staging (verified in the database)
- **Live tables exist:** `pos_captiva_daily_sources`, `pos_captiva_product_observations`, the `pos_exception_*` tables and the void tables. Each has row security and one policy; signed-in users can read and anonymous users can't. `pos_captiva_ingest_receipts`, `pos_captiva_store_bindings` and `pos_void_ingest_requests` have row security, no policies and no grants for signed-in users, so they're reachable by the server only (safe).
- **Product observations hold about 105 rows.**
- **No matching migrations are in the repository.** No screen or report reads these tables; readers still use `sales` and `pos_daily_summaries`. Whether approving a day publishes its data into those tables is unverified. **High** (definitions not checked into the code).
- **Missing definitions:** `operating_day`, `day_is_closed`, `assert_day_open` and `enforce_closed_day_lock` exist only in generated types, with no repository SQL. Their time zone and cutoff behaviour is unverified.

## 5. Stock, supplier invoices, staff, reservations
- **Stock:** the ledger is enforced. Direct writes are blocked by restrictive policies (`20261014120058_*.sql:76-79`). Reading stock needs location access but no inventory permission (product decision).
- **Supplier invoices:** voiding an invoice deliberately leaves the received stock in place and blocks voids once payments are allocated. That is the intended separation.
- **Staff:** `staff_safe` checks the restaurant only, not the location (`20260828140253_*.sql:278-302`). **Med** for keeping the three locations separate.
  - Reports and Dashboard read pay from the base `staff` table, which needs a manager role, so users who can only view reports may silently get no labour figures (suspected).
- **Reservations:**
  - Inquiries count toward booked covers (`useReservations.ts:32-35`).
  - Status changes aren't enforced by the server (`:198-205`). **Med.**

## 6. Security, scoping, caching, errors, dates, tests
- **Finance read access is enforced by the server** for `actual_expenses`, `actual_payroll` and `month_end_closes`. Active Captiva sync and its shared login check confirm the caller's access; legacy ingest returns 410.
- **Not reviewed:** every remaining server-side function, one by one.
- **`pos_integrations_safe`:** checks the restaurant only.
- **Errors shown as zero:** the P&L ignores failed sales, attendance and cost lookups and shows 0 (`useFinancialReports.ts:78-106`). Monthly financials hide which part failed (`useMonthlyFinancials.ts:20-60`). **High.**
- **Caching:**
  - The attendance and delivery-performance caches don't include the restaurant or location (`useStaff.ts:287-301`, `useSupplierAnalytics.ts:121-138`).
  - Switching restaurant refreshes rather than clears cached data (`RestaurantContext.tsx:279-289`).
  - Expense and supplier changes don't refresh `monthly-pnl` or `cash-flow`. **Med.**
- **Dates:** Reports builds its day list with `toISOString().split("T")[0]` (`ReportsPage.tsx:1336`), which can shift a day in some time zones. **Med.**
- **Tests:** seven files exist in `tests/`, but `package.json` has no test script, so pass or fail is unverified. **Med.**

## 7. Reusable pieces (don't rebuild)
- **Revenue logic:** `revenueTruth.ts`, `posDailyCanonical.ts`, `labourRate.ts`, `labour.ts`.
- **Costs and closing:** `monthlyFinancials.ts`, `monthEndClose.ts`, `get_period_actual_food_cost`, `get_theoretical_usage`, `actual_expenses`, `actual_payroll`, `overheads`, `month_end_closes` with its event history.
- **Daily data:** `daily_ledger_entries` (per location and day), `daily_ai_summaries`, the POS approval and sign-off tables and functions.
- **Screens:** `DailyFinancialSummary`, `DailyControlCentre` and the Reports daily breakdown.

## 8. Missing data and source fields
- **`sales`:** no net/VAT column and no time of sale, so true hourly figures aren't possible.
- **Day journal:** there is no append-only, timestamped manager journal. Ledger rows are editable daily records.
- **Day close:** Reports' "Mark closed" means "No trading" (`ReportsPage.tsx:647-663`), not a manager's end-of-day sign-off.
- **Unverified:** whether the overlap between XLS and API data actually exists in the live data.

## 9. Shortest safe staged plan (each stage needs separate approval; no new pages)
1. **Stage A: correctness fixes, frontend only.**
   - Make Reports' "All locations" sum the per-location ledger rows.
   - Make Reports product detail use the shared de-duplication.
   - Replace the remaining unknown→0 coercions with Unknown.
   - Show query errors in the P&L and monthly financials instead of 0.
   - Fix the day-list date shift.
   - Add a test command and tests for each rule.
2. **Stage B: one revenue truth.** Route the Dashboard, Daily Financial Summary and location cards through the same canonical POS resolver as Reports, add net-of-VAT figures from `pos_daily_summaries`, and label every figure Gross, Net, Actual or Estimate.
3. **Stage C: daily costs.**
   - Price manual hours with the user-set rate.
   - Read `actual_expenses` in the daily summary using the monthly replacement rules.
   - Use one profit definition everywhere, with or without overheads, stated clearly.
   - Use staff start and end dates in salary estimates.
4. **Stage D: single daily journal and profit view on the existing Dashboard.**
   - Merge `DailyControlCentre` and `DailyFinancialSummary` into one view per location and day, with drilldowns to Reports and Sales.
   - Add an append-only manager journal and a day-close sign-off. This needs a small database change, proposed separately.
5. **Stage E: Captiva staging bridge.**
   - Check the live definitions of the approve and sign-off functions and of `operating_day`, and commit them to the repository.
   - Then have the readers use approved days only.
6. **Stage F: hardening.**
   - Location checks for `staff_safe` and `pos_integrations_safe`.
   - Server-enforced reservation status changes.
   - Scope the cache keys and clear the cache on restaurant switch.
   - Review the remaining server-side functions.
   - Test the three-location fixtures with restricted users.

## Read-only checks still needed
- Live data: rows with more than one source for the same location and day; whether `sales.total_price` includes VAT.
- Live definitions of the functions listed in section 4.
- Pay visibility for users who can only view reports, checked while signed in.
