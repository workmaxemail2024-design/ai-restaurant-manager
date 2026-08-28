-- Allowed document file extensions (matches the iPad photo capture + PDF/XLS workflows)
CREATE OR REPLACE FUNCTION public.storage_doc_extension_allowed(_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(regexp_replace(coalesce(_name, ''), '^.*\.', '')) IN (
    'jpg','jpeg','png','heic','heif','webp','gif','pdf','xls','xlsx','csv','txt'
  );
$$;

DROP POLICY IF EXISTS documents_tenant_insert ON storage.objects;
CREATE POLICY documents_tenant_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND public.user_belongs_to_restaurant(public.storage_doc_restaurant_id(name))
  AND public.storage_doc_extension_allowed(name)
);

DROP POLICY IF EXISTS documents_tenant_update ON storage.objects;
CREATE POLICY documents_tenant_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND public.user_belongs_to_restaurant(public.storage_doc_restaurant_id(name))
)
WITH CHECK (
  bucket_id = 'documents'
  AND public.user_belongs_to_restaurant(public.storage_doc_restaurant_id(name))
  AND public.storage_doc_extension_allowed(name)
);

-- Notifications: the target user must also belong to the restaurant
CREATE OR REPLACE FUNCTION public.create_notification(
  p_restaurant_id uuid,
  p_title text,
  p_message text,
  p_type text DEFAULT 'info'::text,
  p_user_id uuid DEFAULT NULL::uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_notification_id uuid;
BEGIN
  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_id is required' USING ERRCODE = '22023';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.user_belongs_to_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Not authorised to create notifications for this restaurant' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_restaurants
    WHERE user_id = p_user_id AND restaurant_id = p_restaurant_id
  ) THEN
    RAISE EXCEPTION 'Target user is not a member of this restaurant' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.notifications (restaurant_id, user_id, type, title, message, metadata)
  VALUES (p_restaurant_id, p_user_id, p_type, p_title, p_message, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$function$;