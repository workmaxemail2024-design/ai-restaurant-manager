
-- Table for manual daily ledger inputs (covers, labour, expenses, notes)
CREATE TABLE public.daily_ledger_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  location_id UUID REFERENCES public.locations(id),
  entry_date DATE NOT NULL,
  covers INTEGER DEFAULT 0,
  labour_hours NUMERIC(10,2) DEFAULT 0,
  additional_expenses NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, location_id, entry_date)
);

-- Enable RLS
ALTER TABLE public.daily_ledger_entries ENABLE ROW LEVEL SECURITY;

-- Tenant access policy
CREATE POLICY "Tenant access to daily_ledger_entries"
ON public.daily_ledger_entries
FOR ALL
USING (user_belongs_to_restaurant(restaurant_id))
WITH CHECK (user_belongs_to_restaurant(restaurant_id));

-- Update timestamp trigger
CREATE TRIGGER update_daily_ledger_entries_updated_at
BEFORE UPDATE ON public.daily_ledger_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
