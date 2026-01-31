-- Add extraction columns to documents table
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS extracted_text text,
ADD COLUMN IF NOT EXISTS extracted_data jsonb,
ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'uploaded';

-- Add index for filtering by processing status
CREATE INDEX IF NOT EXISTS idx_documents_processing_status ON public.documents(processing_status);