# iPad Bookings service console

## Scope
Upgrade the existing **Bookings** page only into a live service console. Keep **Floor Plan** as the table-layout editor, **Customers** as full guest history, and **Reservation Settings** as sitting/capacity setup. No new reservation models, statuses, permissions, imports, or database changes.

## What will be built

### Service view
- Make a single selected day the operational focus, while preserving the existing global date selection and location filtering.
- Add **Service** and **Calendar** tabs beside the existing booking controls.
- On iPad landscape and wider screens, show three coordinated panels:
  - **Bookings:** chronological list with time, covers, guest, assigned tables, status, guest search, and daily covers.
  - **Floor:** read-only rendering of the selected location's saved table positions, shapes, dimensions, seats, and areas. Table styling reflects the relevant booking's current state.
  - **Booking details:** customer contacts and notes, time/duration, party size, tables, requests, service timestamps, and repeat-guest history.
- Keep one reservation selection across all three panels: booking selection highlights its tables; table selection selects the relevant booking; status updates refresh the same selection through the existing query cache.
- Use the existing `getNextActions`, timestamp helper, reservation update mutation, conflict checks, status labels/colors, table data, and customer-history query.

### Calendar view
- Reuse reservation queries for the visible month and aggregate non-cancelled/non-declined/no-show party sizes by day.
- Render booked-cover totals in the existing calendar control.
- Selecting a calendar date updates the existing date context to that day and returns to Service view.

### Responsive and touch behavior
- Use the three-panel console at iPad-landscape width where space permits.
- At narrower widths, keep the booking list primary and open the floor plan and selected booking in sheets instead of squeezing columns.
- Important actions and selectors will use 44–48px touch targets; each panel will scroll independently within a stable service-height layout.

## Technical details
- Extract small focused reservation components only where needed: a read-only live floor, compact booking list, booking detail content, and covers calendar.
- Reuse `reservations`, `reservation_tables`, `reservation_customers`, `reservation_sittings`, current hooks, React Query invalidation, restaurant/location contexts, and current RLS.
- Preserve create-booking behavior, table/capacity checks, and all existing reservation lifecycle behavior.
- No schema migration is required.

## Verification
- Confirm booking → table highlight → detail selection and table → booking selection.
- Confirm all existing lifecycle actions update the shared service view and conflict protection remains active.
- Confirm selected-day covers and calendar cover totals exclude non-live statuses consistently.
- Confirm location-scoped tables and reservations never cross locations.
- Check iPad landscape and a narrow/portrait viewport for readable panels, sheets, independent scrolling, and touch targets.
- Confirm Floor Plan, Customers, and Reservation Settings remain unchanged.
