-- 1. Remove the non-idempotent per-sale stock deduction trigger.
DROP TRIGGER IF EXISTS trigger_reduce_stock_on_sale ON public.sales;

-- 2. Idempotent theoretical usage: always recalculated from authoritative sales + recipes.
CREATE OR REPLACE FUNCTION public.get_theoretical_usage(
  p_location_id uuid DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL
)
RETURNS TABLE (
  ingredient_id uuid,
  ingredient_name text,
  base_unit text,
  quantity_used numeric,
  cost numeric,
  dishes_sold numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id AS ingredient_id,
    i.name AS ingredient_name,
    COALESCE(NULLIF(i.pack_unit, ''), i.unit::text) AS base_unit,
    SUM(s.quantity * di.quantity)::numeric AS quantity_used,
    (SUM(s.quantity * di.quantity) * public.get_ingredient_base_cost(i.id))::numeric AS cost,
    SUM(s.quantity)::numeric AS dishes_sold
  FROM public.sales s
  JOIN public.dish_ingredients di ON di.dish_id = s.dish_id
  JOIN public.ingredients i ON i.id = di.ingredient_id
  WHERE s.restaurant_id = public.get_user_restaurant_id()
    AND (p_location_id IS NULL OR s.location_id = p_location_id)
    AND (p_start IS NULL OR s.sale_date >= p_start)
    AND (p_end IS NULL OR s.sale_date <= p_end)
  GROUP BY i.id, i.name, i.pack_unit, i.unit
  ORDER BY 5 DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_theoretical_usage(uuid, date, date) TO authenticated;