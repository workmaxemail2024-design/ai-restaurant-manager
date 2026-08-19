ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS reorder_point numeric,
  ADD COLUMN IF NOT EXISTS par_level numeric,
  ADD COLUMN IF NOT EXISTS shelf_life_days integer;

COMMENT ON COLUMN public.ingredients.reorder_point IS 'Optional genuine reorder threshold in base units. NULL means no threshold configured - item must not be shown as Low/Critical.';
COMMENT ON COLUMN public.ingredients.par_level IS 'Optional target stock level in base units used for reorder quantity suggestions.';
COMMENT ON COLUMN public.ingredients.shelf_life_days IS 'Optional shelf life in days, used to assess genuine wastage risk.';