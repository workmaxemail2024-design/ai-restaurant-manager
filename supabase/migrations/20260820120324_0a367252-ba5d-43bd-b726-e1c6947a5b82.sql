ALTER TABLE public.external_pos_items DROP CONSTRAINT IF EXISTS external_pos_items_manual_type_check;
ALTER TABLE public.external_pos_items ADD CONSTRAINT external_pos_items_manual_type_check
  CHECK (manual_type IS NULL OR manual_type = ANY (ARRAY['food'::text, 'drink'::text, 'side'::text, 'modifier'::text, 'other'::text]));