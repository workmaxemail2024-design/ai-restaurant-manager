# Lovable implementation brief — Captiva VOID investigations

Build a new **POS > VOID Investigations** page in the existing RestaurantAI application. Reuse existing auth, Supabase client, restaurant/location picker, layout and design tokens. Do not modify sales, dashboards' recognised revenue, or existing POS import flows.

## Data
Read (authenticated RLS protected) from:
- `pos_void_orders` filtered by selected location and trading date range
- `pos_void_order_items` filtered by void_order_id
- `pos_void_order_history` filtered by void_order_id ordered by event_index
- `pos_void_order_reviews` filtered by void_order_id
- `pos_void_review_actions` filtered by void_order_id ordered by created_at

All data is tenant- and location-scoped by Supabase RLS. Never use service-role keys in browser code. No sample data shown as real records. Empty state: 'No imported VOID investigations yet.'

## UX
- List with date, order number, recorded VOID value (NOT financial loss), created by, VOID by, review status, missing reason indicator, and filter by restaurant/location, dates, operator, status.
- Clicking an order opens a side panel with product table (description, qty, unit price, line value), creator vs VOID actor, full chronological event timeline including discounts, payments and refunds, and manager review.
- Keep original Captiva fields read-only. Clearly mark 'Recorded VOID value — financial loss not verified'. Refund event counts must NOT imply settled refunds.
- Review controls: status pending/investigating/resolved; resolution text; manager note at least five characters. Submit a fresh UUID request_id and void_order_id to Supabase Edge Function `pos-void-review` using the logged-in user's JWT. Do not write review tables directly.
- On successful review, refresh review summary and append-only action history. Handle 401/403/409/500 errors and loading states.
- Display total recorded VOID values with the disclaimer that it is not verified loss. Never add this total to sales or revenue.
- Responsive mobile/tablet view, accessible labels and clear confirmation before resolving.

## Acceptance
1. Unauthenticated and wrong-location users cannot see VOID records.
2. Two VOID orders with same order number at different locations are distinct.
3. Refund event timeline shows individual events without asserting payment settlement.
4. Duplicate review submissions using same request_id do not create duplicate actions.
5. No VOID rows until signed ingest is explicitly enabled and completed.
