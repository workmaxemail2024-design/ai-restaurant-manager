-- Add captiva_operator_code column to staff table for POS mapping
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS captiva_operator_code text;

-- Create index for faster POS mapping lookups
CREATE INDEX IF NOT EXISTS idx_staff_captiva_operator_code 
ON public.staff(captiva_operator_code) 
WHERE captiva_operator_code IS NOT NULL;