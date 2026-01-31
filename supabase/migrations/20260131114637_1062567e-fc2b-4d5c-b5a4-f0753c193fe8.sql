-- Create documents table
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  location_id uuid NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  supplier_id uuid NULL REFERENCES public.suppliers(id) ON DELETE SET NULL,
  category text NOT NULL,
  filename text NOT NULL,
  mime_type text NOT NULL,
  storage_path text NOT NULL,
  document_date date NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Tenant access policy (same pattern as other tables)
CREATE POLICY "Tenant access to documents"
  ON public.documents
  FOR ALL
  USING (user_belongs_to_restaurant(restaurant_id))
  WITH CHECK (user_belongs_to_restaurant(restaurant_id));

-- Add updated_at trigger
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create private storage bucket for documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false);

-- Storage policies for documents bucket
CREATE POLICY "Users can upload documents to their restaurant"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'documents' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = 'restaurant'
  );

CREATE POLICY "Users can view documents from their restaurant"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'documents' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can delete documents from their restaurant"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'documents' AND
    auth.uid() IS NOT NULL
  );