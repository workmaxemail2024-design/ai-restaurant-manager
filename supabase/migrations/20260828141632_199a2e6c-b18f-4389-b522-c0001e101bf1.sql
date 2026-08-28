CREATE OR REPLACE VIEW public.pos_integrations_safe AS
SELECT
  p.id,
  p.restaurant_id,
  p.location_id,
  p.pos_provider,
  p.status,
  p.webhook_url,
  p.last_sync_time,
  p.last_tested_at,
  p.last_test_status,
  p.last_test_error,
  p.last_sync_attempt_at,
  p.last_successful_sync_at,
  p.last_sync_status,
  p.last_sync_error,
  p.created_at,
  p.updated_at,
  (p.api_key IS NOT NULL) AS has_api_key,
  (p.api_secret IS NOT NULL) AS has_api_secret,
  CASE WHEN public.user_can_view_pos_credentials() THEN p.settings ELSE NULL::jsonb END AS settings
FROM public.pos_integrations p
WHERE public.user_belongs_to_restaurant(p.restaurant_id);

GRANT SELECT ON public.pos_integrations_safe TO authenticated;
GRANT SELECT ON public.pos_integrations_safe TO service_role;