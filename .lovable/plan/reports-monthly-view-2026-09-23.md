# Reports Monthly View

## Confirmed approach

This can be implemented entirely with the current Reports hooks, tables, permissions, and calculations. No database, schema, RLS, import, or historical-data changes are required.

The Monthly experience will remain inside the existing **Period Summary** area. The current Daily view and the other Reports tabs will remain unchanged.

## What will be built

- Add a touch-friendly **Daily | Monthly** segmented control near the top of Period Summary.
- Keep **Daily** as the default and preserve its date picker, period cards, calendar, Daily Performance cards, Data Completeness, Quick Fix, costing details, and editing actions.
- Add a year selector and a responsive 12-card January–December overview.
- On each elapsed month, show concise values drawn from the same Reports inputs:
  - canonical revenue and trading-day count;
  - authoritative orders and covers when known;
  - date-aware food cost and food-cost percentage, including estimated/coverage status;
  - existing attendance/manual-ledger labour and labour percentage;
  - Reports profit after the same food cost, labour, and daily expenses;
  - compact data-completeness status based on existing report provenance and daily completeness rules.
- Mark the current month **In progress**. Keep future months inactive with no fabricated zero values.
- Open a selected month as an in-page Monthly Recap with:
  - Back to months action;
  - Revenue, Orders, Covers, Food Cost, Labour, and Profit KPIs;
  - calendar-week recap using the same daily inputs and unknown/estimated rules;
  - one responsive daily revenue trend;
  - the existing `DayCard` Daily Performance rows for the month, including current drill-down, completeness, Quick Fix, costing, and ledger behavior.

## Data reuse and calculation rules

- Fetch the selected year through the existing restaurant/location-scoped hooks: `useDailyBreakdown`, `useDailyLedger`, and `useDailyFoodCosting`.
- Reuse canonical daily revenue and corrected Products Sold / Sales Summary provenance from `useDailyBreakdown` and `posReportAvailability`.
- Reuse effective orders/covers rules, attendance-first labour with manual-ledger fallback, salary allocation, daily expenses, and existing profit semantics from Reports.
- Aggregate money as sums and percentages from aggregate totals; never average daily percentages.
- Aggregate food-cost resolver rows with the existing shared food-cost model so historical, fallback, estimated, recipe coverage, and missing-cost states remain visible.
- Treat nullable counts as unknown unless at least one authoritative value exists; never convert missing orders, covers, food quality, labour, or profit certainty into zero.
- A month total must equal the sum of the same Daily Reports values for that month.

## Focused implementation structure

- Add a Reports-only monthly presentation component and a small Reports aggregation helper so `ReportsPage.tsx` stays manageable.
- Extract/reuse the existing day-summary calculation boundary rather than creating a second financial engine.
- Use the existing card, button, segmented-control, badge, and chart libraries with semantic theme tokens.
- Use a 1/2/3-column month grid across phone/iPad portrait/iPad landscape-desktop widths; keep weekly rows readable with safe horizontal scrolling only when necessary.

## Verification

- Run the project type check and inspect preview build diagnostics.
- Verify responsive layout at iPad portrait (768×1024) and landscape (1024×768).
- Verify September 2026 monthly revenue equals the sum of its canonical Daily Reports revenue.
- Verify September’s food-cost historical/fallback/estimated quality and missing labour remain visibly labelled.
- Verify opening September, weekly totals, daily trend, Back to months, and reused Daily Performance rows.
- Confirm no data, database, schema, RLS, permission, POS import, or other page changes.
