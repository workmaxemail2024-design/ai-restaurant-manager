CREATE TABLE public.dish_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX dish_categories_restaurant_norm_uq ON public.dish_categories (restaurant_id, lower(btrim(name)));
CREATE INDEX dish_categories_restaurant_idx ON public.dish_categories (restaurant_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dish_categories TO authenticated;
GRANT ALL ON public.dish_categories TO service_role;
ALTER TABLE public.dish_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY dish_categories_member_select ON public.dish_categories FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant(restaurant_id));
CREATE POLICY dish_categories_edit_insert ON public.dish_categories FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_restaurant(restaurant_id) AND public.user_has_permission('menu','edit'));
CREATE POLICY dish_categories_edit_update ON public.dish_categories FOR UPDATE TO authenticated
  USING (public.user_belongs_to_restaurant(restaurant_id) AND public.user_has_permission('menu','edit'))
  WITH CHECK (public.user_belongs_to_restaurant(restaurant_id) AND public.user_has_permission('menu','edit'));
CREATE POLICY dish_categories_admin_delete ON public.dish_categories FOR DELETE TO authenticated
  USING (public.user_belongs_to_restaurant(restaurant_id) AND public.user_has_permission('menu','admin'));

CREATE OR REPLACE FUNCTION public.trim_dish_category_name()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.name := btrim(NEW.name);
  IF NEW.name = '' THEN RAISE EXCEPTION 'Category name is required'; END IF;
  IF length(NEW.name) > 80 THEN RAISE EXCEPTION 'Category name is too long'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_trim_dish_category_name BEFORE INSERT OR UPDATE OF name ON public.dish_categories
  FOR EACH ROW EXECUTE FUNCTION public.trim_dish_category_name();
CREATE TRIGGER update_dish_categories_updated_at BEFORE UPDATE ON public.dish_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.dish_categories (restaurant_id, name, sort_order)
SELECT restaurant_id, category,
  (row_number() OVER (PARTITION BY restaurant_id ORDER BY
     COALESCE(array_position(ARRAY['appetizers','starters','mains','sides','desserts','beverages','drinks','other'], lower(btrim(category))), 999),
     lower(category), category))::int * 10
FROM (SELECT DISTINCT restaurant_id, category FROM public.dishes
      WHERE restaurant_id IS NOT NULL AND category IS NOT NULL AND btrim(category) <> '') s;

CREATE OR REPLACE FUNCTION public.ensure_dish_category_exists()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.restaurant_id IS NULL OR NEW.category IS NULL OR btrim(NEW.category) = '' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.category IS NOT DISTINCT FROM OLD.category THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.dish_categories WHERE restaurant_id = NEW.restaurant_id
             AND lower(btrim(name)) = lower(btrim(NEW.category))) THEN RETURN NEW; END IF;
  INSERT INTO public.dish_categories (restaurant_id, name, sort_order)
  SELECT NEW.restaurant_id, btrim(NEW.category),
         COALESCE((SELECT max(sort_order) FROM public.dish_categories WHERE restaurant_id = NEW.restaurant_id), 0) + 10
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.ensure_dish_category_exists() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_ensure_dish_category AFTER INSERT OR UPDATE OF category ON public.dishes
  FOR EACH ROW EXECUTE FUNCTION public.ensure_dish_category_exists();

CREATE OR REPLACE FUNCTION public.rename_dish_category(p_id uuid, p_new_name text, p_merge boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.dish_categories; t public.dish_categories; v_name text := btrim(p_new_name); n int;
BEGIN
  SELECT * INTO c FROM public.dish_categories WHERE id = p_id;
  IF NOT FOUND OR NOT public.user_belongs_to_restaurant(c.restaurant_id) THEN RAISE EXCEPTION 'Category not found'; END IF;
  IF NOT public.user_has_permission('menu','edit') THEN RAISE EXCEPTION 'You do not have permission to manage categories'; END IF;
  IF v_name IS NULL OR v_name = '' THEN RAISE EXCEPTION 'Category name is required'; END IF;
  IF v_name = c.name THEN RETURN jsonb_build_object('dishes_updated', 0); END IF;
  SELECT * INTO t FROM public.dish_categories
   WHERE restaurant_id = c.restaurant_id AND lower(btrim(name)) = lower(v_name) AND id <> c.id LIMIT 1;
  IF FOUND THEN
    IF NOT p_merge THEN RAISE EXCEPTION 'A category named "%" already exists', t.name USING ERRCODE = 'P0002'; END IF;
    UPDATE public.dishes SET category = t.name
     WHERE restaurant_id = c.restaurant_id AND lower(btrim(category)) = lower(btrim(c.name));
    GET DIAGNOSTICS n = ROW_COUNT;
    DELETE FROM public.dish_categories WHERE id = c.id;
    IF t.archived_at IS NOT NULL THEN UPDATE public.dish_categories SET archived_at = NULL WHERE id = t.id; END IF;
    RETURN jsonb_build_object('merged_into', t.id, 'dishes_updated', n);
  END IF;
  UPDATE public.dish_categories SET name = v_name WHERE id = c.id;
  UPDATE public.dishes SET category = v_name
   WHERE restaurant_id = c.restaurant_id AND lower(btrim(category)) = lower(btrim(c.name));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('dishes_updated', n);
END; $$;
REVOKE ALL ON FUNCTION public.rename_dish_category(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_dish_category(uuid, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_dish_category(p_id uuid, p_move_to uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.dish_categories; t public.dish_categories; n int := 0; remaining int;
BEGIN
  SELECT * INTO c FROM public.dish_categories WHERE id = p_id;
  IF NOT FOUND OR NOT public.user_belongs_to_restaurant(c.restaurant_id) THEN RAISE EXCEPTION 'Category not found'; END IF;
  IF NOT public.user_has_permission('menu','edit') THEN RAISE EXCEPTION 'You do not have permission to manage categories'; END IF;
  SELECT count(*) INTO remaining FROM public.dishes
   WHERE restaurant_id = c.restaurant_id AND lower(btrim(category)) = lower(btrim(c.name));
  IF remaining > 0 THEN
    IF p_move_to IS NULL THEN
      RAISE EXCEPTION 'This category is used by % dish(es). Choose another category to move them to first.', remaining;
    END IF;
    SELECT * INTO t FROM public.dish_categories WHERE id = p_move_to AND restaurant_id = c.restaurant_id AND id <> c.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Target category not found'; END IF;
    UPDATE public.dishes SET category = t.name
     WHERE restaurant_id = c.restaurant_id AND lower(btrim(category)) = lower(btrim(c.name));
    GET DIAGNOSTICS n = ROW_COUNT;
    IF t.archived_at IS NOT NULL THEN UPDATE public.dish_categories SET archived_at = NULL WHERE id = t.id; END IF;
  END IF;
  IF public.user_has_permission('menu','admin') THEN
    DELETE FROM public.dish_categories WHERE id = c.id;
    RETURN jsonb_build_object('action','deleted','dishes_moved', n);
  END IF;
  UPDATE public.dish_categories SET archived_at = now() WHERE id = c.id;
  RETURN jsonb_build_object('action','archived','dishes_moved', n);
END; $$;
REVOKE ALL ON FUNCTION public.remove_dish_category(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_dish_category(uuid, uuid) TO authenticated;