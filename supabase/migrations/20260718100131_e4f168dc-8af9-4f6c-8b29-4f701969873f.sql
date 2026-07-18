
ALTER TABLE public.dishes
  ADD COLUMN IF NOT EXISTS direct_cost numeric,
  ADD COLUMN IF NOT EXISTS use_direct_cost boolean NOT NULL DEFAULT false;

-- Update cost calculator: if use_direct_cost is on and direct_cost is set, return it.
-- Otherwise sum recipe ingredients as before. Returns NULL when neither is configured
-- so callers can distinguish "genuinely zero" from "missing cost".
CREATE OR REPLACE FUNCTION public.calculate_dish_cost(p_dish_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_use_direct boolean;
  v_direct numeric;
  v_recipe_total numeric := 0;
  v_ing_count int := 0;
BEGIN
  SELECT use_direct_cost, direct_cost
  INTO v_use_direct, v_direct
  FROM public.dishes
  WHERE id = p_dish_id;

  IF v_use_direct AND v_direct IS NOT NULL THEN
    RETURN ROUND(v_direct::numeric, 2);
  END IF;

  SELECT COUNT(*), COALESCE(SUM(di.quantity * public.get_ingredient_base_cost(di.ingredient_id)), 0)
  INTO v_ing_count, v_recipe_total
  FROM public.dish_ingredients di
  WHERE di.dish_id = p_dish_id;

  IF v_ing_count = 0 THEN
    RETURN NULL;
  END IF;

  RETURN ROUND(v_recipe_total, 2);
END;
$function$;

-- Margin now returns NULL when cost is unknown, instead of a misleading 100%.
CREATE OR REPLACE FUNCTION public.calculate_dish_margin(p_dish_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cost numeric;
  v_price numeric;
BEGIN
  v_cost := public.calculate_dish_cost(p_dish_id);

  SELECT selling_price INTO v_price FROM public.dishes WHERE id = p_dish_id;

  IF v_cost IS NULL OR v_price IS NULL OR v_price = 0 THEN
    RETURN NULL;
  END IF;

  RETURN ROUND(((v_price - v_cost) / v_price) * 100, 2);
END;
$function$;
