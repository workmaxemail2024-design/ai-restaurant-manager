CREATE TABLE public.daily_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'Other',
  note text,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_expenses TO authenticated;
GRANT ALL ON public.daily_expenses TO service_role;

ALTER TABLE public.daily_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage daily expenses in their restaurant"
ON public.daily_expenses
FOR ALL
TO authenticated
USING (public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (public.user_belongs_to_restaurant(restaurant_id));

CREATE INDEX idx_daily_expenses_scope
  ON public.daily_expenses (restaurant_id, location_id, entry_date);

CREATE TRIGGER update_daily_expenses_updated_at
BEFORE UPDATE ON public.daily_expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Explicit "no expenses today" confirmation on the existing ledger
ALTER TABLE public.daily_ledger_entries
  ADD COLUMN IF NOT EXISTS expenses_confirmed boolean NOT NULL DEFAULT false;

-- Keep daily_ledger_entries.additional_expenses in sync as the derived total
CREATE OR REPLACE FUNCTION public.sync_daily_expense_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_restaurant uuid;
  v_location uuid;
  v_date date;
  v_total numeric;
  v_updated integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_restaurant := OLD.restaurant_id; v_location := OLD.location_id; v_date := OLD.entry_date;
  ELSE
    v_restaurant := NEW.restaurant_id; v_location := NEW.location_id; v_date := NEW.entry_date;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM public.daily_expenses
  WHERE restaurant_id = v_restaurant AND location_id = v_location AND entry_date = v_date;

  UPDATE public.daily_ledger_entries
  SET additional_expenses = v_total, updated_at = now()
  WHERE restaurant_id = v_restaurant AND location_id = v_location AND entry_date = v_date;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    INSERT INTO public.daily_ledger_entries (restaurant_id, location_id, entry_date, additional_expenses)
    VALUES (v_restaurant, v_location, v_date, v_total);
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_sync_daily_expense_total
AFTER INSERT OR UPDATE OR DELETE ON public.daily_expenses
FOR EACH ROW EXECUTE FUNCTION public.sync_daily_expense_total();