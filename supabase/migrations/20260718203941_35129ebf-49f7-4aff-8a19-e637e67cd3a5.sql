
-- Add source column to external_pos_items
ALTER TABLE public.external_pos_items ADD COLUMN IF NOT EXISTS source text;

-- Create historical aggregate product summaries
CREATE TABLE IF NOT EXISTS public.historical_pos_product_summaries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  pos_provider text NOT NULL DEFAULT 'captiva',
  external_item_id text NOT NULL,
  item_name text,
  department text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_label text,
  quantity_sold numeric NOT NULL DEFAULT 0,
  gross_sales numeric NOT NULL DEFAULT 0,
  net_sales numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  source_file_name text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historical_pos_product_summaries_unique UNIQUE (restaurant_id, location_id, pos_provider, external_item_id, period_start, period_end)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.historical_pos_product_summaries TO authenticated;
GRANT ALL ON public.historical_pos_product_summaries TO service_role;

ALTER TABLE public.historical_pos_product_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hist_pos_select" ON public.historical_pos_product_summaries
  FOR SELECT TO authenticated USING (public.user_belongs_to_restaurant(restaurant_id));
CREATE POLICY "hist_pos_insert" ON public.historical_pos_product_summaries
  FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_restaurant(restaurant_id));
CREATE POLICY "hist_pos_update" ON public.historical_pos_product_summaries
  FOR UPDATE TO authenticated USING (public.user_belongs_to_restaurant(restaurant_id))
  WITH CHECK (public.user_belongs_to_restaurant(restaurant_id));
CREATE POLICY "hist_pos_delete" ON public.historical_pos_product_summaries
  FOR DELETE TO authenticated USING (public.user_belongs_to_restaurant(restaurant_id));

CREATE INDEX IF NOT EXISTS idx_hist_pos_restaurant_period
  ON public.historical_pos_product_summaries (restaurant_id, location_id, period_start, period_end);

CREATE TRIGGER trg_hist_pos_updated_at
  BEFORE UPDATE ON public.historical_pos_product_summaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
