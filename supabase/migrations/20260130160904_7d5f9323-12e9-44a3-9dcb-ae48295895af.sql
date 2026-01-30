-- Add contract type enum
CREATE TYPE public.contract_type AS ENUM ('full_time', 'part_time', 'casual');

-- Add contract fields to staff table
ALTER TABLE public.staff
ADD COLUMN contract_type public.contract_type NOT NULL DEFAULT 'full_time',
ADD COLUMN max_hours_per_week numeric NOT NULL DEFAULT 40,
ADD COLUMN min_hours_per_week numeric;

-- Add is_draft column to staff_shifts table
ALTER TABLE public.staff_shifts
ADD COLUMN is_draft boolean NOT NULL DEFAULT false;