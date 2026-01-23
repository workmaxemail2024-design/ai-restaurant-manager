-- Create overheads table for persistent fixed costs
CREATE TABLE public.overheads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  amount NUMERIC NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add constraint for valid categories
ALTER TABLE public.overheads ADD CONSTRAINT overheads_category_check 
  CHECK (category IN ('Rent', 'Utilities', 'Insurance', 'Marketing', 'Software', 'Other'));

-- Add constraint for valid frequencies
ALTER TABLE public.overheads ADD CONSTRAINT overheads_frequency_check 
  CHECK (frequency IN ('daily', 'weekly', 'monthly'));

-- Enable RLS
ALTER TABLE public.overheads ENABLE ROW LEVEL SECURITY;

-- RLS policy for tenant access (same pattern as other tables)
CREATE POLICY "Tenant access to overheads"
ON public.overheads
FOR ALL
USING (user_belongs_to_restaurant(restaurant_id))
WITH CHECK (user_belongs_to_restaurant(restaurant_id));

-- Service role access for AI/cron use
CREATE POLICY "service_role_can_read_overheads"
ON public.overheads
FOR SELECT
USING (true);

CREATE POLICY "service_role_can_insert_overheads"
ON public.overheads
FOR INSERT
WITH CHECK (true);

CREATE POLICY "service_role_can_update_overheads"
ON public.overheads
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY "service_role_can_delete_overheads"
ON public.overheads
FOR DELETE
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_overheads_updated_at
BEFORE UPDATE ON public.overheads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();