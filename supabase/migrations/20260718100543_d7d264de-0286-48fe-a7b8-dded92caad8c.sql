
CREATE OR REPLACE FUNCTION public.calculate_dish_cost(p_dish_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_use_direct boolean;
  v_direct numeric;
  v_ing_count integer;
  v_total numeric := 0;
BEGIN
  SELECT use_direct_cost, direct_cost INTO v_use_direct, v_direct
  FROM public.dishes WHERE id = p_dish_id;

  IF v_use_direct IS TRUE THEN
    IF v_direct IS NULL OR v_direct <= 0 THEN
      RETURN NULL;
    END IF;
    RETURN ROUND(v_direct, 2);
  END IF;

  SELECT COUNT(*) INTO v_ing_count FROM public.dish_ingredients WHERE dish_id = p_dish_id;
  IF v_ing_count = 0 THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(di.quantity * public.get_ingredient_base_cost(di.ingredient_id)), 0)
  INTO v_total
  FROM public.dish_ingredients di
  WHERE di.dish_id = p_dish_id;

  RETURN ROUND(v_total, 2);
END;
$function$;

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
  IF v_cost IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT selling_price INTO v_price FROM public.dishes WHERE id = p_dish_id;
  IF v_price IS NULL OR v_price = 0 THEN
    RETURN NULL;
  END IF;

  RETURN ROUND(((v_price - v_cost) / v_price) * 100, 2);
END;
$function$;
