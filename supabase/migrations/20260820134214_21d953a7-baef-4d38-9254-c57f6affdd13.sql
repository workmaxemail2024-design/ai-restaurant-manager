REVOKE ALL ON FUNCTION public.merge_dishes(uuid, uuid, boolean, boolean, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_dishes(uuid, uuid, boolean, boolean, boolean, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.merge_dishes(uuid, uuid, boolean, boolean, boolean, boolean) TO authenticated;