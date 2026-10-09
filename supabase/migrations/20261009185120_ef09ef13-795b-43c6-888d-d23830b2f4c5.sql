-- Server-side Inventory Edit protection for inventory items. Reads unchanged.
CREATE POLICY "inventory_edit_required_insert" ON public.ingredients AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_inventory());
CREATE POLICY "inventory_edit_required_update" ON public.ingredients AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (public.can_edit_inventory()) WITH CHECK (public.can_edit_inventory());
CREATE POLICY "inventory_edit_required_delete" ON public.ingredients AS RESTRICTIVE
  FOR DELETE TO authenticated USING (public.can_edit_inventory());

CREATE OR REPLACE FUNCTION public.delete_or_archive_ingredient(p_ingredient_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d jsonb;
BEGIN
  IF NOT public.can_edit_inventory() THEN
    RAISE EXCEPTION 'inventory edit permission required';
  END IF;
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
END; $function$;