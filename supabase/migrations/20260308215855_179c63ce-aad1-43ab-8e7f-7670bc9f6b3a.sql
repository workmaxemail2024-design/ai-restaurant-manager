-- Add 'arrived' to reservation_status enum
ALTER TYPE public.reservation_status ADD VALUE IF NOT EXISTS 'arrived' AFTER 'confirmed';

-- Add service tracking timestamps and cancellation reason
ALTER TABLE public.reservations 
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS seated_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;