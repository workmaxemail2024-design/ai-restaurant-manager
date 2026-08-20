ALTER TABLE public.dishes
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.dishes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dishes_archived_at ON public.dishes(archived_at);
CREATE INDEX IF NOT EXISTS idx_dishes_merged_into ON public.dishes(merged_into_id);

CREATE OR REPLACE FUNCTION public.merge_dishes(
  p_master_id uuid,
  p_duplicate_id uuid,
  p_use_duplicate_recipe boolean DEFAULT false,
  p_use_duplicate_price boolean DEFAULT false,
  p_use_duplicate_name boolean DEFAULT false,
  p_use_duplicate_category boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_master public.dishes%ROWTYPE;
  v_dup public.dishes%ROWTYPE;
  v_moved_sales int := 0;
BEGIN
  IF p_master_id = p_duplicate_id THEN
    RAISE EXCEPTION 'A dish cannot be merged into itself';
  END IF;

  SELECT * INTO v_master FROM public.dishes WHERE id = p_master_id;
  SELECT * INTO v_dup FROM public.dishes WHERE id = p_duplicate_id;

  IF v_master.id IS NULL OR v_dup.id IS NULL THEN
    RAISE EXCEPTION 'Both dishes must exist';
  END IF;

  IF v_master.restaurant_id IS DISTINCT FROM v_dup.restaurant_id THEN
    RAISE EXCEPTION 'Dishes belong to different restaurants';
  END IF;

  IF NOT public.user_belongs_to_restaurant(v_master.restaurant_id) THEN
    RAISE EXCEPTION 'Not authorised for this restaurant';
  END IF;

  -- Historical sales and POS references are moved, never deleted
  UPDATE public.sales SET dish_id = p_master_id WHERE dish_id = p_duplicate_id;
  GET DIAGNOSTICS v_moved_sales = ROW_COUNT;

  UPDATE public.pos_sales_import SET mapped_dish_id = p_master_id WHERE mapped_dish_id = p_duplicate_id;
  UPDATE public.external_pos_items SET mapped_dish_id = p_master_id WHERE mapped_dish_id = p_duplicate_id;
  UPDATE public.pos_mappings SET internal_id = p_master_id
    WHERE mapping_type = 'dish' AND internal_id = p_duplicate_id;
  UPDATE public.ingredients SET linked_dish_id = p_master_id WHERE linked_dish_id = p_duplicate_id;

  -- Menu assignments: move unless the master is already on that menu
  DELETE FROM public.menu_dishes md
   WHERE md.dish_id = p_duplicate_id
     AND EXISTS (SELECT 1 FROM public.menu_dishes m2
                  WHERE m2.menu_id = md.menu_id AND m2.dish_id = p_master_id);
  UPDATE public.menu_dishes SET dish_id = p_master_id WHERE dish_id = p_duplicate_id;

  -- Keep exactly one canonical recipe / cost source
  IF p_use_duplicate_recipe THEN
    DELETE FROM public.dish_ingredients WHERE dish_id = p_master_id;
    UPDATE public.dish_ingredients SET dish_id = p_master_id WHERE dish_id = p_duplicate_id;
    UPDATE public.dishes
       SET direct_cost = v_dup.direct_cost,
           use_direct_cost = v_dup.use_direct_cost
     WHERE id = p_master_id;
  END IF;

  UPDATE public.dishes
     SET selling_price = CASE WHEN p_use_duplicate_price THEN v_dup.selling_price ELSE selling_price END,
         name = CASE WHEN p_use_duplicate_name THEN v_dup.name ELSE name END,
         category = CASE WHEN p_use_duplicate_category THEN v_dup.category ELSE category END,
         department = CASE WHEN p_use_duplicate_category THEN v_dup.department ELSE department END,
         captiva_external_id = COALESCE(v_master.captiva_external_id, v_dup.captiva_external_id),
         updated_at = now()
   WHERE id = p_master_id;

  -- Archive the duplicate and record the merge target
  UPDATE public.dishes
     SET archived_at = now(),
         archived_by = auth.uid(),
         merged_into_id = p_master_id,
         is_active = false,
         updated_at = now()
   WHERE id = p_duplicate_id;

  RETURN jsonb_build_object('master_id', p_master_id, 'duplicate_id', p_duplicate_id, 'moved_sales', v_moved_sales);
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_dishes(uuid, uuid, boolean, boolean, boolean, boolean) TO authenticated;