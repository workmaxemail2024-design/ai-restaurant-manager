-- Add unique constraint on pos_sales_import for idempotent imports
-- This prevents duplicate imports when re-importing the same date range

-- First, create a unique index on the combination of location_id, pos_provider, and external_sale_id
-- This enforces that the same sale can only be imported once per location/provider

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_sales_import_unique_sale 
ON public.pos_sales_import (location_id, pos_provider, external_sale_id) 
WHERE external_sale_id IS NOT NULL;

-- Add a comment explaining the constraint
COMMENT ON INDEX idx_pos_sales_import_unique_sale IS 'Prevents duplicate imports of the same POS sale. external_sale_id is the receipt/transaction ID from the POS system.';