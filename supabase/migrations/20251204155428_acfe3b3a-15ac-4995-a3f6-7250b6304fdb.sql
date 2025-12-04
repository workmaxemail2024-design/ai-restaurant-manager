-- Add captiva_external_id column to dishes table for mapping POS items
ALTER TABLE public.dishes 
ADD COLUMN IF NOT EXISTS captiva_external_id text;

-- Create index for fast lookup by captiva external id
CREATE INDEX IF NOT EXISTS idx_dishes_captiva_external_id 
ON public.dishes(captiva_external_id) 
WHERE captiva_external_id IS NOT NULL;