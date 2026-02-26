
-- Add is_closed flag, manual sales override, and covers_unknown flag
ALTER TABLE public.daily_ledger_entries
  ADD COLUMN IF NOT EXISTS is_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_revenue numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS manual_orders integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS covers_unknown boolean NOT NULL DEFAULT false;
