REVOKE EXECUTE ON FUNCTION public.get_user_permissions() FROM supabase_read_only_user;
REVOKE EXECUTE ON FUNCTION public.user_has_permission(text, text) FROM supabase_read_only_user;
REVOKE EXECUTE ON FUNCTION public.user_belongs_to_restaurant(uuid) FROM supabase_read_only_user;