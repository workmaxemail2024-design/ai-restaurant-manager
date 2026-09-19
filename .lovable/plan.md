# Role Builder + User Assignments upgrade

## What I found (audit of what already exists)

**Permissions** live in one place: `roles.permissions` (free-form JSON), read by `get_user_permissions()` and `user_has_permission()`, surfaced to the app through `RestaurantContext` → `usePermissions()`. The sidebar (`PermissionFilteredSidebar`) already filters by resource + action, and `RequirePermission` already blocks pages.

**Page-level permissions need no database change.** The permissions JSON is stored and returned as-is, so page entries can be added alongside the existing category entries. Existing roles keep working unchanged (a page with no explicit entry falls back to its category permission).

**Real sidebar today** (this is what Role Builder will mirror — note the differences from your example: Staff has "Shifts", Operations includes Documents, AI Intelligence has Insights Dashboard and AI Assistant, Analytics has Product Intelligence, Settings has Role Builder / Audit Log / Backup & Recovery):

Overview (Dashboard, Locations) · Staff (Staff List, Shifts, Attendance, KPIs) · Menu (Dishes, Cost Analysis, AI Engineering) · Inventory (Inventory Items, Stock Levels, Forecasting) · Operations (Suppliers, Purchase Orders, Documents, Sales, Reports) · Reservations (Bookings, Floor Plan, Customers, Settings) · AI Intelligence (Insights Dashboard, AI Assistant, Daily Summary, Staff Scheduling) · Automation (Automation Rules) · Analytics (Multi-Location, Menu Performance, Forecast, Product Intelligence) · Settings (POS Integrations, Financial / Overheads, Role Builder, Audit Log, Backup & Recovery)

**Invitations** already exist: `restaurant_invites` (email, role, role_id, location_id, status, expiry) and `ensure_user_restaurant()` accepts a pending invite on the invited person's next login, including their location. Owner-only access is already enforced by RLS. Four gaps: no name is stored, only one location per invite, no email is actually sent, and there is no way to deactivate a member.

## Smallest database change required (needs your approval)

```sql
-- 1. Invited person's name (display only)
ALTER TABLE public.restaurant_invites ADD COLUMN IF NOT EXISTS full_name text;

-- 2. More than one permitted location per invitation
ALTER TABLE public.restaurant_invites ADD COLUMN IF NOT EXISTS location_ids uuid[];

-- 3. Active / Inactive member status
ALTER TABLE public.user_restaurants
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 4. Deactivated members lose all access everywhere (one helper, used by every RLS policy)
CREATE OR REPLACE FUNCTION public.user_belongs_to_restaurant(_restaurant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_restaurants
    WHERE user_id = auth.uid() AND restaurant_id = _restaurant_id AND is_active
  )
$$;
-- get_user_permissions() and user_has_permission() likewise require is_active.

-- 5. ensure_user_restaurant(): also grant every location in location_ids on accept.

-- 6. Owner lock-out guard: a trigger refuses to deactivate, delete or demote the
--    last active full-access member of a restaurant.
```

Nothing else changes: no new permission model, no new user table, no change to RLS structure, location scoping or existing role rows.

## Then (after approval)

**Role Builder — Roles tab**
- One shared route map (single source of truth) used by both the sidebar and Role Builder, so they can never drift.
- Collapsible category sections in real sidebar order, each page a row with View / Edit / Admin switches, plus per-category "All view" / "All edit" / "Clear" buttons. Admin implies edit implies view, as today.
- Owner stays Full Access and stays uneditable.

**Enforcement**
- Sidebar hides pages whose View is off.
- Every route is wrapped in a page guard so typing the URL is refused too.
- Security still rests on the database: RLS, location scoping and the existing helpers are untouched.

**User Assignments tab**
- "Invite user": name, email, role (Manager / Staff / custom), one or more locations. Invitation email is sent through Supabase Auth from a server function; the Owner never sees or sets anyone's password.
- Member list shows name/email, role, assigned locations and Active / Invited / Inactive.
- Owner can change role, change locations, resend a pending invite, and deactivate or reactivate access. The last Owner cannot be locked out.

Touch-friendly rows and controls (44–48px) throughout; no other pages changed.
