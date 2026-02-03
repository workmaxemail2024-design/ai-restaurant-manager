-- Enable pg_cron and pg_net extensions for scheduled edge function calls
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- Schedule the captiva-schedule-sync function to run daily at midnight UTC
SELECT cron.schedule(
  'captiva-daily-sync',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url := 'https://bjykbjpyodowzstfqoge.supabase.co/functions/v1/captiva-schedule-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('scheduled', true, 'run_at', now()::text)
  );
  $$
);