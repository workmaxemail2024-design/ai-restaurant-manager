-- Add purchase_order_id column to documents table for linking invoices to POs
ALTER TABLE public.documents
ADD COLUMN purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL;

-- Add index for efficient lookups
CREATE INDEX idx_documents_purchase_order_id ON public.documents(purchase_order_id);

-- RLS is already enforced on the documents table via restaurant_id scoping
-- The existing policies will continue to work since this is just a nullable FK column