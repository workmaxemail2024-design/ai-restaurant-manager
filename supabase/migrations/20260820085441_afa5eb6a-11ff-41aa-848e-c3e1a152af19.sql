ALTER TABLE public.staff_attendance
  ADD COLUMN IF NOT EXISTS is_corrected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_clock_in timestamp with time zone,
  ADD COLUMN IF NOT EXISTS original_clock_out timestamp with time zone,
  ADD COLUMN IF NOT EXISTS original_source text,
  ADD COLUMN IF NOT EXISTS corrected_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS corrected_by uuid;