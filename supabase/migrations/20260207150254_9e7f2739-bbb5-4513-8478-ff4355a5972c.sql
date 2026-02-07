-- Add pack-based costing fields to ingredients
ALTER TABLE public.ingredients
ADD COLUMN IF NOT EXISTS purchase_unit text DEFAULT 'each',
ADD COLUMN IF NOT EXISTS pack_size numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS pack_unit text DEFAULT 'each',
ADD COLUMN IF NOT EXISTS cost_per_pack numeric DEFAULT 0;

-- Add constraint for valid pack units
ALTER TABLE public.ingredients
ADD CONSTRAINT ingredients_pack_unit_check 
CHECK (pack_unit IN ('each', 'g', 'kg', 'ml', 'L'));

-- Add constraint for valid purchase units  
ALTER TABLE public.ingredients
ADD CONSTRAINT ingredients_purchase_unit_check
CHECK (purchase_unit IN ('each', 'g', 'kg', 'ml', 'L', 'case'));

-- Add constraint for pack_size > 0 when provided
ALTER TABLE public.ingredients
ADD CONSTRAINT ingredients_pack_size_positive
CHECK (pack_size IS NULL OR pack_size > 0);

-- Add constraint for cost_per_pack >= 0
ALTER TABLE public.ingredients
ADD CONSTRAINT ingredients_cost_per_pack_non_negative
CHECK (cost_per_pack >= 0);

-- Create function to calculate cost per base unit
CREATE OR REPLACE FUNCTION public.get_ingredient_base_cost(p_ingredient_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pack_size numeric;
  v_pack_unit text;
  v_cost_per_pack numeric;
  v_default_cost numeric;
  v_base_cost numeric;
  v_multiplier numeric;
BEGIN
  SELECT pack_size, pack_unit, cost_per_pack, default_cost_price
  INTO v_pack_size, v_pack_unit, v_cost_per_pack, v_default_cost
  FROM public.ingredients
  WHERE id = p_ingredient_id;
  
  -- If no pack data, fall back to default_cost_price (backward compatibility)
  IF v_pack_size IS NULL OR v_pack_size = 0 OR v_cost_per_pack IS NULL OR v_cost_per_pack = 0 THEN
    RETURN COALESCE(v_default_cost, 0);
  END IF;
  
  -- Calculate multiplier to convert to base units (g for weight, ml for volume)
  CASE v_pack_unit
    WHEN 'kg' THEN v_multiplier := 1000;  -- 1kg = 1000g
    WHEN 'L' THEN v_multiplier := 1000;   -- 1L = 1000ml
    WHEN 'g' THEN v_multiplier := 1;
    WHEN 'ml' THEN v_multiplier := 1;
    WHEN 'each' THEN v_multiplier := 1;
    ELSE v_multiplier := 1;
  END CASE;
  
  -- Cost per base unit = cost_per_pack / (pack_size * multiplier)
  v_base_cost := v_cost_per_pack / (v_pack_size * v_multiplier);
  
  RETURN COALESCE(v_base_cost, 0);
END;
$function$;

-- Update calculate_dish_cost to use the new base cost function
CREATE OR REPLACE FUNCTION public.calculate_dish_cost(p_dish_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  total_cost DECIMAL(10, 4) := 0;
BEGIN
  SELECT COALESCE(SUM(di.quantity * public.get_ingredient_base_cost(di.ingredient_id)), 0)
  INTO total_cost
  FROM public.dish_ingredients di
  WHERE di.dish_id = p_dish_id;
  
  RETURN ROUND(total_cost, 2);
END;
$function$;