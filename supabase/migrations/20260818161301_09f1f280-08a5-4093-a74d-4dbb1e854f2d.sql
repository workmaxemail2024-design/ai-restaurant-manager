ALTER TABLE public.daily_ledger_entries
  ADD COLUMN IF NOT EXISTS labour_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS labour_confirmed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS labour_confirmed_by uuid;