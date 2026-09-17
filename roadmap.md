
## Inventory improvements 1-6 (approved plan)
- [ ] Migration: item_group/category, stock_counts, stock_count_lines, count adjustment type + safeguards
- [ ] Group/Category on inventory item forms + filters on Inventory Items and Stock
- [ ] Stock page terminology + Count Stock action
- [ ] iPad count workflow (scope -> enter -> review -> submit)
- [ ] Last counted / Count due (>7 days)
- [ ] Read-only Variance view

## Captiva safe fixes (approved)
- [x] Deterministic POS external sale IDs (no random fallback; ambiguous rows rejected + logged)
- [x] Multi-store XLS preview with per-store location mapping (existing / new / skip)
- [x] Owner-facing Captiva sync status on POS Integrations
- [ ] Nightly cron — intentionally NOT enabled until Captiva confirms request envelope / UserID

## POS dual-report merge (Products Sold + Daily Sales Summary)
- [x] Migration (approved + applied):: product/summary split columns, NULL-safe unknowns, restaurant/location pairing check, narrowed backfill, upsert_pos_daily_summary RPC
- [ ] Blank receipts/visitors must never overwrite existing values
- [ ] Daily Sales Summary report type in the Captiva importer (no product columns required)
- [ ] Gross reconciliation panel (both figures, EUR diff, % diff, Matched / Small variance / Needs review)
- [ ] Preview: report type, location, trading date, gross, orders, visitors + "existing data found" notice
- [ ] Single canonical daily figure per location/date across providers in readers:
      useDailyBreakdown, useDashboardOverview, useDailyFinancialSummary, ai-assistant, ai-daily-summary
- [ ] Test matrix: products only / summary only / both orders / re-upload / mismatch / blank counts

## Historical food costing (proposal awaiting approval)
- [ ] Blended item-level food cost (actual + 30% only on uncosted revenue)
- [x] Date-aware costing migration applied + verified (functions, seed, revisions, immutability)
- [x] ingredient_prices reused as dated history + frozen baseline seeded
- [ ] Single shared resolver (get_period_food_cost / get_daily_food_cost) for Reports, Dashboard, P&L, AI
- [ ] Reports UI: coverage %, actual vs estimated split, missing-cost item count -> Dishes filter

## Historical costing - backdated prices (approved)
- [x] Migration: revision column + deterministic ordering, unique (ingredient_id, effective_date, revision)
- [x] add_ingredient_price RPC for backdated entry (owner/manager)
- [x] Immutable history rows (corrections = new revision, audit logged)
- [ ] Ingredients UI: "Add historical price" with Effective from date (after DB verification)
