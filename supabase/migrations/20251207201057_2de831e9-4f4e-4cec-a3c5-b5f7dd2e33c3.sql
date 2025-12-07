-- Add service_role bypass policies for all POS-related tables
-- These allow edge functions using service_role key to read/write without RLS restrictions

-- Drop existing service_role policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "service_role_can_read_sales" ON public.sales;
DROP POLICY IF EXISTS "service_role_can_insert_sales" ON public.sales;
DROP POLICY IF EXISTS "service_role_can_update_sales" ON public.sales;
DROP POLICY IF EXISTS "service_role_can_delete_sales" ON public.sales;

DROP POLICY IF EXISTS "service_role_can_read_staff_attendance" ON public.staff_attendance;
DROP POLICY IF EXISTS "service_role_can_insert_staff_attendance" ON public.staff_attendance;
DROP POLICY IF EXISTS "service_role_can_update_staff_attendance" ON public.staff_attendance;
DROP POLICY IF EXISTS "service_role_can_delete_staff_attendance" ON public.staff_attendance;

DROP POLICY IF EXISTS "service_role_can_read_dishes" ON public.dishes;
DROP POLICY IF EXISTS "service_role_can_insert_dishes" ON public.dishes;
DROP POLICY IF EXISTS "service_role_can_update_dishes" ON public.dishes;
DROP POLICY IF EXISTS "service_role_can_delete_dishes" ON public.dishes;

DROP POLICY IF EXISTS "service_role_can_read_pos_sync_logs" ON public.pos_sync_logs;
DROP POLICY IF EXISTS "service_role_can_insert_pos_sync_logs" ON public.pos_sync_logs;
DROP POLICY IF EXISTS "service_role_can_update_pos_sync_logs" ON public.pos_sync_logs;
DROP POLICY IF EXISTS "service_role_can_delete_pos_sync_logs" ON public.pos_sync_logs;

DROP POLICY IF EXISTS "service_role_can_read_pos_sales_import" ON public.pos_sales_import;
DROP POLICY IF EXISTS "service_role_can_insert_pos_sales_import" ON public.pos_sales_import;
DROP POLICY IF EXISTS "service_role_can_update_pos_sales_import" ON public.pos_sales_import;

DROP POLICY IF EXISTS "service_role_can_read_pos_staff_import" ON public.pos_staff_import;
DROP POLICY IF EXISTS "service_role_can_insert_pos_staff_import" ON public.pos_staff_import;
DROP POLICY IF EXISTS "service_role_can_update_pos_staff_import" ON public.pos_staff_import;

DROP POLICY IF EXISTS "service_role_can_read_staff" ON public.staff;
DROP POLICY IF EXISTS "service_role_can_insert_staff" ON public.staff;
DROP POLICY IF EXISTS "service_role_can_update_staff" ON public.staff;

DROP POLICY IF EXISTS "service_role_can_read_pos_mappings" ON public.pos_mappings;
DROP POLICY IF EXISTS "service_role_can_insert_pos_mappings" ON public.pos_mappings;
DROP POLICY IF EXISTS "service_role_can_update_pos_mappings" ON public.pos_mappings;

-- Sales table service_role policies
CREATE POLICY "service_role_can_read_sales" ON public.sales FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_can_insert_sales" ON public.sales FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_can_update_sales" ON public.sales FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_can_delete_sales" ON public.sales FOR DELETE TO service_role USING (true);

-- Staff attendance table service_role policies
CREATE POLICY "service_role_can_read_staff_attendance" ON public.staff_attendance FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_can_insert_staff_attendance" ON public.staff_attendance FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_can_update_staff_attendance" ON public.staff_attendance FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_can_delete_staff_attendance" ON public.staff_attendance FOR DELETE TO service_role USING (true);

-- Dishes table service_role policies
CREATE POLICY "service_role_can_read_dishes" ON public.dishes FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_can_insert_dishes" ON public.dishes FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_can_update_dishes" ON public.dishes FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_can_delete_dishes" ON public.dishes FOR DELETE TO service_role USING (true);

-- POS sync logs table service_role policies
CREATE POLICY "service_role_can_read_pos_sync_logs" ON public.pos_sync_logs FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_can_insert_pos_sync_logs" ON public.pos_sync_logs FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_can_update_pos_sync_logs" ON public.pos_sync_logs FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_can_delete_pos_sync_logs" ON public.pos_sync_logs FOR DELETE TO service_role USING (true);

-- POS sales import table service_role policies
CREATE POLICY "service_role_can_read_pos_sales_import" ON public.pos_sales_import FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_can_insert_pos_sales_import" ON public.pos_sales_import FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_can_update_pos_sales_import" ON public.pos_sales_import FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- POS staff import table service_role policies
CREATE POLICY "service_role_can_read_pos_staff_import" ON public.pos_staff_import FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_can_insert_pos_staff_import" ON public.pos_staff_import FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_can_update_pos_staff_import" ON public.pos_staff_import FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- Staff table service_role policies
CREATE POLICY "service_role_can_read_staff" ON public.staff FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_can_insert_staff" ON public.staff FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_can_update_staff" ON public.staff FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- POS mappings table service_role policies
CREATE POLICY "service_role_can_read_pos_mappings" ON public.pos_mappings FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_can_insert_pos_mappings" ON public.pos_mappings FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_can_update_pos_mappings" ON public.pos_mappings FOR UPDATE TO service_role USING (true) WITH CHECK (true);