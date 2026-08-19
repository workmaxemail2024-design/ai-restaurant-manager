REVOKE ALL ON FUNCTION public.get_theoretical_usage(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_theoretical_usage(uuid, date, date) TO authenticated;