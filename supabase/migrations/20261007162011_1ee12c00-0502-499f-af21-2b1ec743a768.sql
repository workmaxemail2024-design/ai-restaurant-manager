ALTER TABLE public.ingredients ALTER COLUMN default_cost_price DROP NOT NULL;

ALTER TABLE public.ingredients DROP CONSTRAINT ingredients_category_check;
ALTER TABLE public.ingredients ADD CONSTRAINT ingredients_category_check CHECK (
  category IS NULL OR category = ANY (ARRAY['meat','poultry','fish_seafood','dairy','fruit',
  'vegetables','dry_goods','bakery','frozen','beer','wine','spirits','soft_drinks',
  'packaging','cleaning','ppe','other']));

ALTER TABLE public.ingredient_prices DROP CONSTRAINT ingredient_prices_source_chk;
ALTER TABLE public.ingredient_prices ADD CONSTRAINT ingredient_prices_source_chk CHECK (
  source = ANY (ARRAY['seed_current','legacy','manual','purchase','backdated','initial_import']));

CREATE OR REPLACE FUNCTION public.record_ingredient_price_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_base numeric; v_import boolean;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.default_cost_price IS NOT DISTINCT FROM OLD.default_cost_price
     AND NEW.cost_per_pack      IS NOT DISTINCT FROM OLD.cost_per_pack
     AND NEW.pack_size          IS NOT DISTINCT FROM OLD.pack_size
     AND NEW.pack_unit          IS NOT DISTINCT FROM OLD.pack_unit
     AND NEW.unit               IS NOT DISTINCT FROM OLD.unit
  THEN RETURN NEW; END IF;

  v_base := NULLIF(public.get_ingredient_base_cost(NEW.id), 0);
  IF v_base IS NULL THEN RETURN NEW; END IF;

  v_import := COALESCE(current_setting('app.initial_import_ingredient', true) = NEW.id::text, false);

  PERFORM public.insert_ingredient_price_row(
    NEW.id, CURRENT_DATE,
    CASE WHEN v_import THEN 'initial_import' ELSE 'manual' END,
    COALESCE(NEW.default_cost_price, 0), v_base,
    NEW.pack_size, NEW.pack_unit, NEW.cost_per_pack,
    CASE WHEN v_import THEN 'Initial stock list import' ELSE NULL END,
    auth.uid());
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_ingredient_cost_at_date(p_ingredient_id uuid, p_date date)
RETURNS TABLE(cost numeric, is_historical boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_cost numeric; v_rest uuid; v_caller uuid;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.ingredients WHERE id = p_ingredient_id;
  IF v_rest IS NULL THEN RETURN QUERY SELECT NULL::numeric, false; RETURN; END IF;
  IF NOT public.is_trusted_backend_session() THEN
    v_caller := public.get_user_restaurant_id();
    IF v_caller IS NULL OR v_caller <> v_rest THEN
      RAISE EXCEPTION 'not authorized for this ingredient';
    END IF;
  END IF;
  SELECT p.cost_per_base_unit INTO v_cost FROM public.ingredient_prices p
   WHERE p.ingredient_id = p_ingredient_id
     AND p.effective_date <= COALESCE(p_date, CURRENT_DATE)
     AND p.cost_per_base_unit IS NOT NULL
     AND p.source IN ('manual','purchase','backdated','initial_import')
   ORDER BY p.effective_date DESC, p.revision DESC, p.created_at DESC LIMIT 1;
  IF v_cost IS NOT NULL THEN RETURN QUERY SELECT v_cost, true; RETURN; END IF;
  SELECT p.cost_per_base_unit INTO v_cost FROM public.ingredient_prices p
   WHERE p.ingredient_id = p_ingredient_id
     AND p.effective_date <= COALESCE(p_date, CURRENT_DATE)
     AND p.cost_per_base_unit IS NOT NULL
     AND p.source IN ('seed_current','legacy')
   ORDER BY p.effective_date DESC, p.revision DESC, p.created_at DESC LIMIT 1;
  RETURN QUERY SELECT v_cost, false;
END; $function$;

CREATE OR REPLACE FUNCTION public.set_initial_import_price(
  p_ingredient_id uuid, p_cost_per_pack numeric, p_pack_size numeric,
  p_pack_unit text, p_unit_cost numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_rest uuid;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.ingredients WHERE id = p_ingredient_id;
  IF v_rest IS NULL THEN RAISE EXCEPTION 'ingredient not found'; END IF;
  IF v_rest <> COALESCE(public.get_user_restaurant_id(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
    RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT (public.user_is_owner() OR public.user_has_permission('inventory','edit')) THEN
    RAISE EXCEPTION 'inventory edit permission required'; END IF;
  IF EXISTS (SELECT 1 FROM public.ingredient_prices WHERE ingredient_id = p_ingredient_id) THEN
    RAISE EXCEPTION 'item already has price history; initial import will not overwrite it'; END IF;
  IF NOT (COALESCE(p_cost_per_pack,0) > 0 AND COALESCE(p_pack_size,0) > 0)
     AND NOT (COALESCE(p_unit_cost,0) > 0) THEN
    RAISE EXCEPTION 'a positive cost is required'; END IF;

  PERFORM set_config('app.initial_import_ingredient', p_ingredient_id::text, true);
  UPDATE public.ingredients
     SET cost_per_pack      = p_cost_per_pack,
         pack_size          = p_pack_size,
         pack_unit          = COALESCE(p_pack_unit, pack_unit),
         default_cost_price = p_unit_cost
   WHERE id = p_ingredient_id;
  PERFORM set_config('app.initial_import_ingredient', '', true);

  PERFORM public.log_audit_event(v_rest, 'ingredient_initial_import_price',
    'Initial stock list price recorded', jsonb_build_object('ingredient_id', p_ingredient_id));
END; $function$;
REVOKE ALL ON FUNCTION public.set_initial_import_price(uuid,numeric,numeric,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_initial_import_price(uuid,numeric,numeric,text,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.calculate_dish_cost(p_dish_id uuid)
 RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_use_direct boolean; v_direct numeric; v_count integer := 0; v_total numeric := 0; v_qty numeric; v_line numeric; r RECORD;
BEGIN
  PERFORM public.assert_dish_access(p_dish_id);
  SELECT use_direct_cost, direct_cost INTO v_use_direct, v_direct FROM public.dishes WHERE id = p_dish_id;
  IF v_use_direct IS TRUE THEN
    IF v_direct IS NULL OR v_direct <= 0 THEN RETURN NULL; END IF;
    RETURN ROUND(v_direct, 2);
  END IF;
  FOR r IN SELECT * FROM public.recipe_lines_for_dish(p_dish_id) LOOP
    v_count := v_count + 1;
    IF r.cost_mode = 'manual' AND r.manual_line_cost IS NOT NULL THEN
      v_total := v_total + r.manual_line_cost;
    ELSE
      v_qty := public.convert_recipe_qty(r.ingredient_id, r.quantity, r.unit);
      IF v_qty IS NULL THEN RETURN NULL; END IF;
      v_line := NULLIF(public.get_ingredient_base_cost(r.ingredient_id), 0);
      IF v_line IS NULL THEN RETURN NULL; END IF;
      v_total := v_total + v_qty * v_line;
    END IF;
  END LOOP;
  IF v_count = 0 THEN RETURN NULL; END IF;
  RETURN ROUND(v_total, 2);
END; $function$;