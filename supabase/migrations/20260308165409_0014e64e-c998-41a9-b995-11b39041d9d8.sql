
-- Create daily_ai_summaries table
CREATE TABLE public.daily_ai_summaries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  summary_date date NOT NULL,
  summary_text text NOT NULL,
  metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, location_id, summary_date)
);

-- Enable RLS
ALTER TABLE public.daily_ai_summaries ENABLE ROW LEVEL SECURITY;

-- RLS policy: tenant access
CREATE POLICY "Tenant access to daily_ai_summaries"
  ON public.daily_ai_summaries
  FOR ALL
  TO authenticated
  USING (user_belongs_to_restaurant(restaurant_id))
  WITH CHECK (user_belongs_to_restaurant(restaurant_id));

-- Index for fast lookups
CREATE INDEX idx_daily_ai_summaries_restaurant_date ON public.daily_ai_summaries (restaurant_id, summary_date DESC);
