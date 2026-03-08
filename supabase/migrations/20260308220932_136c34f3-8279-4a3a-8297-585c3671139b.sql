
-- Add new columns for allocation support
ALTER TABLE public.overheads 
  ADD COLUMN IF NOT EXISTS allocation_mode text NOT NULL DEFAULT 'equal',
  ADD COLUMN IF NOT EXISTS allocation_details jsonb NOT NULL DEFAULT '{}'::jsonb;

-- No enum needed - frequency is already text, so we can use any value
-- Supported values: one_time, daily, weekly, monthly, quarterly, yearly
