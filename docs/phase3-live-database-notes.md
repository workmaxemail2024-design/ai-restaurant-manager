# Phase 3 — items needing a live database check or change (not applied)

1. **Staff delete cascade.** `staff_attendance`, `staff_shifts` and `staff_performance` reference `staff` with `ON DELETE CASCADE`. The app now sets staff with history to *inactive* instead of deleting, but a direct delete (SQL editor / other clients) would still erase history. Recommended additive change: a BEFORE DELETE guard on `staff` that refuses deletes when history exists.
2. **Restaurant ID defaults.** The app now always sends `restaurant_id` when creating staff and recipe lines. Confirm live that no existing rows have `restaurant_id IS NULL` in `staff` / `dish_ingredients` (read-only check).
3. **Manual-hours labour rate** is stored per restaurant in the browser. A shared, server-side setting would need a new column (e.g. on `restaurants` or `locations`) — not added.
4. **Hourly sales** need a real transaction-time column on `sales` (not added).
5. **Purchase order "completed" status.** The server guard refuses direct status changes to `completed`/`received`; any legacy rows stuck at `completed` can still be received. Confirm none exist with `received_at IS NULL AND status='completed'` older than expected.
6. **AI reporting** functions authenticate the caller and verify membership before using the admin client; no change needed. `ai-staff-scheduling` now receives no fabricated hourly demand.
