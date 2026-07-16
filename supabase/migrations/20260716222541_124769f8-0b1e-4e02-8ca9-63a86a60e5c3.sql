ALTER TABLE public.external_pos_items
  ADD COLUMN IF NOT EXISTS manual_drink_type text
    CHECK (manual_drink_type IN ('alcoholic','non_alcoholic','unknown') OR manual_drink_type IS NULL);