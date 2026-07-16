
CREATE TABLE IF NOT EXISTS public.pos_daily_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  pos_provider text NOT NULL,
  report_date date NOT NULL,
  gross_sales numeric(12,2) NOT NULL DEFAULT 0,
  net_sales numeric(12,2) NOT NULL DEFAULT 0,
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  discounts numeric(12,2) NOT NULL DEFAULT 0,
  order_count integer,
  visitor_count integer,
  average_order_value numeric(12,2),
  source_file_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pos_daily_summaries_unique
  ON public.pos_daily_summaries (restaurant_id, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid), pos_provider, report_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_daily_summaries TO authenticated;
GRANT ALL ON public.pos_daily_summaries TO service_role;

ALTER TABLE public.pos_daily_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant read pos_daily_summaries"
  ON public.pos_daily_summaries FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_restaurant(restaurant_id));

CREATE POLICY "tenant write pos_daily_summaries"
  ON public.pos_daily_summaries FOR INSERT
  TO authenticated
  WITH CHECK (public.user_belongs_to_restaurant(restaurant_id));

CREATE POLICY "tenant update pos_daily_summaries"
  ON public.pos_daily_summaries FOR UPDATE
  TO authenticated
  USING (public.user_belongs_to_restaurant(restaurant_id))
  WITH CHECK (public.user_belongs_to_restaurant(restaurant_id));

CREATE POLICY "tenant delete pos_daily_summaries"
  ON public.pos_daily_summaries FOR DELETE
  TO authenticated
  USING (public.user_belongs_to_restaurant(restaurant_id));

CREATE TRIGGER update_pos_daily_summaries_updated_at
  BEFORE UPDATE ON public.pos_daily_summaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
