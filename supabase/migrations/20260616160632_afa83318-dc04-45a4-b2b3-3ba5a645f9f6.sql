
-- Ensure column is not null so we can build a full (non-partial) unique constraint
ALTER TABLE public.pos_sales_import
  ALTER COLUMN external_sale_id SET NOT NULL;

-- Drop the old partial unique index (ON CONFLICT can't target partial indexes by column list)
DROP INDEX IF EXISTS public.idx_pos_sales_import_unique_sale;

-- Add a proper unique constraint scoped to restaurant + location + provider + external sale id
ALTER TABLE public.pos_sales_import
  ADD CONSTRAINT pos_sales_import_unique_sale
  UNIQUE (restaurant_id, location_id, pos_provider, external_sale_id);
