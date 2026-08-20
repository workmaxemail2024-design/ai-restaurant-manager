ALTER TABLE public.external_pos_items
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS manual_department text,
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.external_pos_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_external_pos_items_archived_at ON public.external_pos_items (archived_at);
CREATE INDEX IF NOT EXISTS idx_external_pos_items_merged_into ON public.external_pos_items (merged_into_id);