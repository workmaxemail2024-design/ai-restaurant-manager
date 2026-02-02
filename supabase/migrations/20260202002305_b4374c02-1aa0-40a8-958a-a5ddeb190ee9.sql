-- Create stock_adjustments table for tracking waste, spoilage, theft, etc.
CREATE TABLE public.stock_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES public.restaurants(id),
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('waste', 'spoilage', 'theft', 'damage', 'correction', 'other')),
  quantity NUMERIC NOT NULL,
  reason TEXT,
  adjusted_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

-- Create tenant access policy
CREATE POLICY "Tenant access to stock_adjustments"
ON public.stock_adjustments
FOR ALL
USING (((restaurant_id IS NULL) OR user_belongs_to_restaurant(restaurant_id)))
WITH CHECK (((restaurant_id IS NULL) OR user_belongs_to_restaurant(restaurant_id)));

-- Create index for faster queries
CREATE INDEX idx_stock_adjustments_ingredient ON public.stock_adjustments(ingredient_id);
CREATE INDEX idx_stock_adjustments_location ON public.stock_adjustments(location_id);
CREATE INDEX idx_stock_adjustments_created ON public.stock_adjustments(created_at DESC);