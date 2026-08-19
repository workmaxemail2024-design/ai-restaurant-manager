ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'recipe_ingredient',
  ADD COLUMN IF NOT EXISTS linked_dish_id uuid REFERENCES public.dishes(id) ON DELETE SET NULL;

ALTER TABLE public.ingredients
  DROP CONSTRAINT IF EXISTS ingredients_item_type_check;
ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_item_type_check
  CHECK (item_type IN ('recipe_ingredient','direct_sale','operational'));

CREATE INDEX IF NOT EXISTS idx_ingredients_item_type ON public.ingredients(item_type);
CREATE INDEX IF NOT EXISTS idx_ingredients_linked_dish ON public.ingredients(linked_dish_id);

DROP FUNCTION IF EXISTS public.get_theoretical_usage(uuid, date, date);

CREATE OR REPLACE FUNCTION public.get_theoretical_usage(p_location_id uuid DEFAULT NULL::uuid, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date)
 RETURNS TABLE(ingredient_id uuid, ingredient_name text, base_unit text, quantity_used numeric, cost numeric, dishes_sold numeric, usage_source text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Recipe ingredients: sales x recipe quantity
  SELECT
    i.id AS ingredient_id,
    i.name AS ingredient_name,
    COALESCE(NULLIF(i.pack_unit, ''), i.unit::text) AS base_unit,
    SUM(s.quantity * di.quantity)::numeric AS quantity_used,
    (SUM(s.quantity * di.quantity) * public.get_ingredient_base_cost(i.id))::numeric AS cost,
    SUM(s.quantity)::numeric AS dishes_sold,
    'recipe'::text AS usage_source
  FROM public.sales s
  JOIN public.dish_ingredients di ON di.dish_id = s.dish_id
  JOIN public.ingredients i ON i.id = di.ingredient_id
  WHERE s.restaurant_id = public.get_user_restaurant_id()
    AND (p_location_id IS NULL OR s.location_id = p_location_id)
    AND (p_start IS NULL OR s.sale_date >= p_start)
    AND (p_end IS NULL OR s.sale_date <= p_end)
  GROUP BY i.id, i.name, i.pack_unit, i.unit

  UNION ALL

  -- Direct sale items: 1 unit sold = 1 unit consumed (no fake recipe required)
  SELECT
    i.id AS ingredient_id,
    i.name AS ingredient_name,
    COALESCE(NULLIF(i.pack_unit, ''), i.unit::text) AS base_unit,
    SUM(s.quantity)::numeric AS quantity_used,
    (SUM(s.quantity) * public.get_ingredient_base_cost(i.id))::numeric AS cost,
    SUM(s.quantity)::numeric AS dishes_sold,
    'direct_sale'::text AS usage_source
  FROM public.sales s
  JOIN public.ingredients i ON i.linked_dish_id = s.dish_id
  WHERE i.item_type = 'direct_sale'
    AND s.restaurant_id = public.get_user_restaurant_id()
    AND (p_location_id IS NULL OR s.location_id = p_location_id)
    AND (p_start IS NULL OR s.sale_date >= p_start)
    AND (p_end IS NULL OR s.sale_date <= p_end)
  GROUP BY i.id, i.name, i.pack_unit, i.unit

  ORDER BY 4 DESC;
$function$;