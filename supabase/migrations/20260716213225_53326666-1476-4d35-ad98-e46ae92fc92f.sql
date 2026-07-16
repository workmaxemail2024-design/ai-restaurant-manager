
-- 1. Extend dishes as master item library
ALTER TABLE public.dishes
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'food',
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS department TEXT;

-- 2. Extend menu_dishes junction with per-menu overrides
ALTER TABLE public.menu_dishes
  ADD COLUMN IF NOT EXISTS price_override NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS section_override TEXT,
  ADD COLUMN IF NOT EXISTS available_from TIME,
  ADD COLUMN IF NOT EXISTS available_to TIME,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Guarantee no duplicate item-per-menu
CREATE UNIQUE INDEX IF NOT EXISTS menu_dishes_menu_dish_uniq
  ON public.menu_dishes (menu_id, dish_id);

-- 3. External POS Items catalogue (per location + provider)
CREATE TABLE IF NOT EXISTS public.external_pos_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  location_id UUID NOT NULL,
  pos_provider TEXT NOT NULL,
  external_item_id TEXT NOT NULL,
  external_item_name TEXT,
  department TEXT,
  mapped_dish_id UUID REFERENCES public.dishes(id) ON DELETE SET NULL,
  needs_review BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  last_qty NUMERIC(12,3) DEFAULT 0,
  last_gross NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT external_pos_items_uniq UNIQUE (restaurant_id, location_id, pos_provider, external_item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_pos_items TO authenticated;
GRANT ALL ON public.external_pos_items TO service_role;

ALTER TABLE public.external_pos_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant read external_pos_items"
  ON public.external_pos_items FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant(restaurant_id));

CREATE POLICY "Tenant write external_pos_items"
  ON public.external_pos_items FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_restaurant(restaurant_id));

CREATE POLICY "Tenant update external_pos_items"
  ON public.external_pos_items FOR UPDATE TO authenticated
  USING (public.user_belongs_to_restaurant(restaurant_id))
  WITH CHECK (public.user_belongs_to_restaurant(restaurant_id));

CREATE POLICY "Tenant delete external_pos_items"
  ON public.external_pos_items FOR DELETE TO authenticated
  USING (public.user_belongs_to_restaurant(restaurant_id));

DROP TRIGGER IF EXISTS trg_external_pos_items_updated ON public.external_pos_items;
CREATE TRIGGER trg_external_pos_items_updated
  BEFORE UPDATE ON public.external_pos_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Extend pos_sales_import with per-product columns
ALTER TABLE public.pos_sales_import
  ADD COLUMN IF NOT EXISTS external_item_id TEXT,
  ADD COLUMN IF NOT EXISTS item_name TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS gross_sales NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_sales NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0;

-- 5. Extend sales with source + link back to import row for idempotent replay
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS pos_import_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS sales_pos_import_id_uniq
  ON public.sales (pos_import_id) WHERE pos_import_id IS NOT NULL;
