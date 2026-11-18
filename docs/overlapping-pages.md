# Overlapping pages — recommended merges (nothing removed yet)

| Overlap | Pages | Recommendation | Replacement before any removal |
|---|---|---|---|
| Menu profitability | Menu Engineering (`/menu/engineering`) vs Chain Menu Performance | Keep Chain Menu Performance as the product-level screen (classification, mappings). Fold the Menu Engineering matrix in as a tab. | Matrix tab on Chain Menu Performance using the same location filter. |
| Revenue KPIs | Dashboard Operational Snapshot, Daily Financial Summary, Reports Daily Performance | Keep all three; they now share `src/lib/revenueTruth.ts` + `canonicalizePosSummaries`. Reports stays the reconciliation truth. | n/a (logic unified, screens kept). |
| Location comparison | Multi-Location Intelligence vs Dashboard location cards | Merge into one "Locations" comparison view. | Location cards link to the comparison view. |
| Forecasting | Forecast Dashboard vs AI Scheduling demand | Keep Forecast (daily); AI Scheduling hourly demand is shown as unavailable until real sale times exist. | n/a |
| Hidden routes | `/settings/system-qa`, `/settings/demo` | Intentionally unlinked admin tools; keep. | n/a |

Removed in this cleanup (no importers, verified): legacy dashboard `Sidebar`, `SalesDashboardPage`, `POSSyncLogsPage`, `NavLink`, `RevenueChart`.
