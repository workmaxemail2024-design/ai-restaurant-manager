-- Add received_at timestamp to purchase_orders
ALTER TABLE public.purchase_orders 
ADD COLUMN received_at timestamp with time zone DEFAULT NULL;

-- Add index for filtering by received status
CREATE INDEX idx_purchase_orders_received_at ON public.purchase_orders(received_at);

-- Add comment for clarity
COMMENT ON COLUMN public.purchase_orders.received_at IS 'Timestamp when the delivery was received and stock was updated';