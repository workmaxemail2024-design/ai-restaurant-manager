
CREATE TABLE public.system_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  backup_type text NOT NULL DEFAULT 'manual',
  file_path text,
  size_bytes bigint,
  error_message text,
  created_by uuid,
  notes text
);

ALTER TABLE public.system_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant access to system_backups"
  ON public.system_backups
  FOR ALL
  TO authenticated
  USING (user_belongs_to_restaurant(restaurant_id))
  WITH CHECK (user_belongs_to_restaurant(restaurant_id));

CREATE INDEX idx_system_backups_restaurant ON public.system_backups(restaurant_id, created_at DESC);
