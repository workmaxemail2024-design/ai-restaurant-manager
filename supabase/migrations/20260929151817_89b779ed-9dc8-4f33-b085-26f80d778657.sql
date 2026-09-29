ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS archived_at timestamptz, ADD COLUMN IF NOT EXISTS archived_by uuid;

CREATE OR REPLACE FUNCTION public.protect_ingredient_price_history()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_trusted_backend_session() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  -- Narrow exception: removing the single starting price of a never-used item,
  -- only when set transaction-locally by delete_or_archive_ingredient().
  IF TG_OP = 'DELETE'
     AND current_setting('app.unused_ingredient_delete', true) = OLD.ingredient_id::text THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'ingredient price history is immutable - add a new dated entry instead';
END; $$;

CREATE OR REPLACE FUNCTION public.ingredient_dependencies(p_ingredient_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_rid uuid; r jsonb;
BEGIN
  SELECT restaurant_id INTO v_rid FROM ingredients WHERE id = p_ingredient_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found'; END IF;
  IF v_rid IS NULL OR NOT public.user_belongs_to_restaurant(v_rid) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT jsonb_build_object(
    'recipe_lines', (SELECT count(*) FROM dish_ingredients WHERE ingredient_id = p_ingredient_id),
    'linked_dish', (SELECT (linked_dish_id IS NOT NULL)::int FROM ingredients WHERE id = p_ingredient_id),
    'purchase_lines', (SELECT count(*) FROM purchase_order_items WHERE ingredient_id = p_ingredient_id),
    'adjustments', (SELECT count(*) FROM stock_adjustments WHERE ingredient_id = p_ingredient_id),
    'count_lines', (SELECT count(*) FROM stock_count_lines WHERE ingredient_id = p_ingredient_id),
    'stock_on_hand', (SELECT count(*) FROM stock_levels WHERE ingredient_id = p_ingredient_id AND quantity <> 0),
    'price_entries', (SELECT count(*) FROM ingredient_prices WHERE ingredient_id = p_ingredient_id)
  ) INTO r;
  RETURN r || jsonb_build_object('can_delete',
    (r->>'recipe_lines')::int = 0 AND (r->>'linked_dish')::int = 0
    AND (r->>'purchase_lines')::int = 0 AND (r->>'adjustments')::int = 0
    AND (r->>'count_lines')::int = 0 AND (r->>'stock_on_hand')::int = 0
    AND (r->>'price_entries')::int <= 1);
END; $$;

CREATE OR REPLACE FUNCTION public.delete_or_archive_ingredient(p_ingredient_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE d jsonb;
BEGIN
  d := public.ingredient_dependencies(p_ingredient_id); -- also enforces tenant access
  IF (d->>'can_delete')::boolean THEN
    PERFORM set_config('app.unused_ingredient_delete', p_ingredient_id::text, true);
    DELETE FROM stock_levels WHERE ingredient_id = p_ingredient_id; -- zero-quantity rows only
    DELETE FROM ingredient_prices WHERE ingredient_id = p_ingredient_id;
    DELETE FROM ingredients WHERE id = p_ingredient_id;
    PERFORM set_config('app.unused_ingredient_delete', '', true);
    RETURN 'deleted';
  END IF;
  UPDATE ingredients SET archived_at = now(), archived_by = auth.uid()
   WHERE id = p_ingredient_id AND archived_at IS NULL;
  RETURN 'archived';
END; $$;

REVOKE ALL ON FUNCTION public.ingredient_dependencies(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_or_archive_ingredient(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ingredient_dependencies(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_or_archive_ingredient(uuid) TO authenticated, service_role;