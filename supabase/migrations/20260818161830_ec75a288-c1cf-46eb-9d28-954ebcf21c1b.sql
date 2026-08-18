ALTER TABLE public.daily_ledger_entries
  ADD COLUMN IF NOT EXISTS stock_reviewed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_reviewed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS stock_reviewed_by uuid;