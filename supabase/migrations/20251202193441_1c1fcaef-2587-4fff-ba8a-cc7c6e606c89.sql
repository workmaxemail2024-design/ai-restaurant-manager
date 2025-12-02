-- Phase 4: Multi-Tenant SaaS Architecture

-- 1. Create restaurants table
CREATE TABLE public.restaurants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

-- 2. Create user_restaurants linkage table
CREATE TABLE public.user_restaurants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner',
  is_default BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, restaurant_id)
);

ALTER TABLE public.user_restaurants ENABLE ROW LEVEL SECURITY;

-- 3. Add restaurant_id to all relevant tables
ALTER TABLE public.locations ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.dishes ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.ingredients ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.ingredient_prices ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.dish_ingredients ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.stock_levels ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.suppliers ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_orders ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_order_items ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.sales ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.staff ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.staff_shifts ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.staff_attendance ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.staff_performance ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.pos_integrations ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.pos_sales_import ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.pos_staff_import ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.pos_mappings ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.pos_sync_logs ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- 4. Create indexes for restaurant_id
CREATE INDEX idx_locations_restaurant ON public.locations(restaurant_id);
CREATE INDEX idx_dishes_restaurant ON public.dishes(restaurant_id);
CREATE INDEX idx_ingredients_restaurant ON public.ingredients(restaurant_id);
CREATE INDEX idx_suppliers_restaurant ON public.suppliers(restaurant_id);
CREATE INDEX idx_sales_restaurant ON public.sales(restaurant_id);
CREATE INDEX idx_staff_restaurant ON public.staff(restaurant_id);
CREATE INDEX idx_pos_integrations_restaurant ON public.pos_integrations(restaurant_id);
CREATE INDEX idx_user_restaurants_user ON public.user_restaurants(user_id);
CREATE INDEX idx_user_restaurants_restaurant ON public.user_restaurants(restaurant_id);

-- 5. Security definer function to get user's restaurant_id
CREATE OR REPLACE FUNCTION public.get_user_restaurant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT restaurant_id FROM public.user_restaurants 
  WHERE user_id = auth.uid() AND is_default = true
  LIMIT 1
$$;

-- 6. Function to check if user belongs to restaurant
CREATE OR REPLACE FUNCTION public.user_belongs_to_restaurant(_restaurant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_restaurants
    WHERE user_id = auth.uid() AND restaurant_id = _restaurant_id
  )
$$;

-- 7. RLS Policies for restaurants table
CREATE POLICY "Users can view their restaurants"
ON public.restaurants FOR SELECT
USING (public.user_belongs_to_restaurant(id));

CREATE POLICY "Users can insert restaurants"
ON public.restaurants FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update their restaurants"
ON public.restaurants FOR UPDATE
USING (public.user_belongs_to_restaurant(id));

-- 8. RLS Policies for user_restaurants
CREATE POLICY "Users can view their linkages"
ON public.user_restaurants FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their linkages"
ON public.user_restaurants FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their linkages"
ON public.user_restaurants FOR UPDATE
USING (user_id = auth.uid());

-- 9. Drop old permissive policies and create tenant-aware ones

-- Locations
DROP POLICY IF EXISTS "Allow all access to locations" ON public.locations;
CREATE POLICY "Tenant access to locations" ON public.locations FOR ALL
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

-- Dishes
DROP POLICY IF EXISTS "Allow all access to dishes" ON public.dishes;
CREATE POLICY "Tenant access to dishes" ON public.dishes FOR ALL
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

-- Ingredients
DROP POLICY IF EXISTS "Allow all access to ingredients" ON public.ingredients;
CREATE POLICY "Tenant access to ingredients" ON public.ingredients FOR ALL
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

-- Ingredient Prices
DROP POLICY IF EXISTS "Allow all access to ingredient_prices" ON public.ingredient_prices;
CREATE POLICY "Tenant access to ingredient_prices" ON public.ingredient_prices FOR ALL
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

-- Dish Ingredients
DROP POLICY IF EXISTS "Allow all access to dish_ingredients" ON public.dish_ingredients;
CREATE POLICY "Tenant access to dish_ingredients" ON public.dish_ingredients FOR ALL
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

-- Stock Levels
DROP POLICY IF EXISTS "Allow all access to stock_levels" ON public.stock_levels;
CREATE POLICY "Tenant access to stock_levels" ON public.stock_levels FOR ALL
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

-- Suppliers
DROP POLICY IF EXISTS "Allow all access to suppliers" ON public.suppliers;
CREATE POLICY "Tenant access to suppliers" ON public.suppliers FOR ALL
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

-- Purchase Orders
DROP POLICY IF EXISTS "Allow all access to purchase_orders" ON public.purchase_orders;
CREATE POLICY "Tenant access to purchase_orders" ON public.purchase_orders FOR ALL
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

-- Purchase Order Items
DROP POLICY IF EXISTS "Allow all access to purchase_order_items" ON public.purchase_order_items;
CREATE POLICY "Tenant access to purchase_order_items" ON public.purchase_order_items FOR ALL
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

-- Sales
DROP POLICY IF EXISTS "Allow all access to sales" ON public.sales;
CREATE POLICY "Tenant access to sales" ON public.sales FOR ALL
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

-- Staff
DROP POLICY IF EXISTS "Allow all access to staff" ON public.staff;
CREATE POLICY "Tenant access to staff" ON public.staff FOR ALL
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

-- Staff Shifts
DROP POLICY IF EXISTS "Allow all access to staff_shifts" ON public.staff_shifts;
CREATE POLICY "Tenant access to staff_shifts" ON public.staff_shifts FOR ALL
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

-- Staff Attendance
DROP POLICY IF EXISTS "Allow all access to staff_attendance" ON public.staff_attendance;
CREATE POLICY "Tenant access to staff_attendance" ON public.staff_attendance FOR ALL
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

-- Staff Performance
DROP POLICY IF EXISTS "Allow all access to staff_performance" ON public.staff_performance;
CREATE POLICY "Tenant access to staff_performance" ON public.staff_performance FOR ALL
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

-- POS Integrations
DROP POLICY IF EXISTS "Allow all access to pos_integrations" ON public.pos_integrations;
CREATE POLICY "Tenant access to pos_integrations" ON public.pos_integrations FOR ALL
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

-- POS Sales Import
DROP POLICY IF EXISTS "Allow all access to pos_sales_import" ON public.pos_sales_import;
CREATE POLICY "Tenant access to pos_sales_import" ON public.pos_sales_import FOR ALL
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

-- POS Staff Import
DROP POLICY IF EXISTS "Allow all access to pos_staff_import" ON public.pos_staff_import;
CREATE POLICY "Tenant access to pos_staff_import" ON public.pos_staff_import FOR ALL
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

-- POS Mappings
DROP POLICY IF EXISTS "Allow all access to pos_mappings" ON public.pos_mappings;
CREATE POLICY "Tenant access to pos_mappings" ON public.pos_mappings FOR ALL
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

-- POS Sync Logs
DROP POLICY IF EXISTS "Allow all access to pos_sync_logs" ON public.pos_sync_logs;
CREATE POLICY "Tenant access to pos_sync_logs" ON public.pos_sync_logs FOR ALL
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

-- 10. Updated_at trigger for restaurants
CREATE TRIGGER update_restaurants_updated_at
BEFORE UPDATE ON public.restaurants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();