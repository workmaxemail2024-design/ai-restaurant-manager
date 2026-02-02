-- Add test connection tracking columns to pos_integrations
ALTER TABLE public.pos_integrations
ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_test_status TEXT CHECK (last_test_status IN ('success', 'failed')),
ADD COLUMN IF NOT EXISTS last_test_error TEXT;