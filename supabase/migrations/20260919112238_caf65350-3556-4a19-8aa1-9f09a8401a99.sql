GRANT EXECUTE ON FUNCTION public.get_user_permissions() TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.user_has_permission(text, text) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_restaurant(uuid) TO supabase_read_only_user;