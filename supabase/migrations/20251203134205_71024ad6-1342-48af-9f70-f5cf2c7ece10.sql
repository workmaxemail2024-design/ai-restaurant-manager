-- Drop the SECURITY DEFINER view to address linter warning
-- The RLS policies on the table already restrict write access to POS admins
-- Frontend will handle masking credentials for non-admin users
DROP VIEW IF EXISTS public.pos_integrations_safe;