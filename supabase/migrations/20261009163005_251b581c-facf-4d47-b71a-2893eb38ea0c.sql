CREATE TABLE public.supplier_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  normalized_name text NOT NULL,
  product_code text,
  pack_size numeric CHECK (pack_size IS NULL OR pack_size > 0),
  pack_unit text CHECK (pack_unit IS NULL OR pack_unit IN ('each','g','kg','ml','L')),
  purchase_unit text,
  archived_at timestamptz,
  archived_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX supplier_products_code_uq
  ON public.supplier_products (restaurant_id, supplier_id, lower(product_code))
  WHERE product_code IS NOT NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX supplier_products_desc_pack_uq
  ON public.supplier_products (restaurant_id, supplier_id, normalized_name,
                               coalesce(pack_size, -1), coalesce(lower(pack_unit), ''))
  WHERE archived_at IS NULL;
CREATE INDEX supplier_products_ingredient_idx ON public.supplier_products (ingredient_id);

GRANT SELECT ON public.supplier_products TO authenticated;
GRANT ALL ON public.supplier_products TO service_role;
ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read supplier products" ON public.supplier_products
  FOR SELECT TO authenticated USING (public.user_belongs_to_restaurant(restaurant_id));

CREATE TABLE public.supplier_product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  supplier_product_id uuid NOT NULL REFERENCES public.supplier_products(id) ON DELETE RESTRICT,
  effective_date date NOT NULL,
  cost_per_pack numeric NOT NULL CHECK (cost_per_pack > 0),
  pack_size numeric NOT NULL CHECK (pack_size > 0),
  pack_unit text NOT NULL CHECK (pack_unit IN ('each','g','kg','ml','L')),
  base_unit text NOT NULL CHECK (base_unit IN ('g','ml','each')),
  cost_per_base_unit numeric NOT NULL CHECK (cost_per_base_unit > 0),
  source text NOT NULL CHECK (source IN ('initial_import','invoice','purchase_order','manual','correction')),
  document_id uuid REFERENCES public.documents(id) ON DELETE RESTRICT,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  supersedes_id uuid REFERENCES public.supplier_product_prices(id) ON DELETE RESTRICT,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX spp_product_date_idx
  ON public.supplier_product_prices (supplier_product_id, effective_date DESC, created_at DESC);
CREATE UNIQUE INDEX spp_document_uq ON public.supplier_product_prices (supplier_product_id, document_id)
  WHERE document_id IS NOT NULL AND supersedes_id IS NULL;
CREATE UNIQUE INDEX spp_supersedes_uq ON public.supplier_product_prices (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

GRANT SELECT ON public.supplier_product_prices TO authenticated;
GRANT ALL ON public.supplier_product_prices TO service_role;
ALTER TABLE public.supplier_product_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read supplier prices" ON public.supplier_product_prices
  FOR SELECT TO authenticated USING (public.user_belongs_to_restaurant(restaurant_id));

CREATE OR REPLACE FUNCTION public.guard_supplier_product()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Supplier products cannot be deleted; archive instead';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM suppliers WHERE id = NEW.supplier_id AND restaurant_id = NEW.restaurant_id) THEN
    RAISE EXCEPTION 'Supplier does not belong to this restaurant';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ingredients WHERE id = NEW.ingredient_id AND restaurant_id = NEW.restaurant_id) THEN
    RAISE EXCEPTION 'Inventory item does not belong to this restaurant';
  END IF;
  IF TG_OP = 'UPDATE' AND (
       NEW.restaurant_id <> OLD.restaurant_id OR NEW.supplier_id <> OLD.supplier_id
    OR NEW.ingredient_id <> OLD.ingredient_id
    OR NEW.product_code IS DISTINCT FROM OLD.product_code
    OR NEW.normalized_name <> OLD.normalized_name
    OR NEW.pack_size IS DISTINCT FROM OLD.pack_size
    OR NEW.pack_unit IS DISTINCT FROM OLD.pack_unit) THEN
    RAISE EXCEPTION 'Supplier product identity cannot change; archive it and create a new one';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_supplier_product
  BEFORE INSERT OR UPDATE OR DELETE ON public.supplier_products
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_product();

CREATE OR REPLACE FUNCTION public.guard_supplier_product_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sup uuid; v_rid uuid;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    RAISE EXCEPTION 'Supplier price history is append-only; add a correction instead';
  END IF;
  SELECT restaurant_id, supplier_id INTO v_rid, v_sup FROM supplier_products WHERE id = NEW.supplier_product_id;
  IF v_rid IS DISTINCT FROM NEW.restaurant_id THEN
    RAISE EXCEPTION 'Supplier product belongs to a different restaurant';
  END IF;
  IF NEW.document_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM documents WHERE id = NEW.document_id AND restaurant_id = NEW.restaurant_id) THEN
    RAISE EXCEPTION 'Document belongs to a different restaurant';
  END IF;
  IF NEW.purchase_order_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM purchase_orders WHERE id = NEW.purchase_order_id
        AND restaurant_id = NEW.restaurant_id AND supplier_id = v_sup) THEN
    RAISE EXCEPTION 'Purchase order belongs to a different restaurant or supplier';
  END IF;
  IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM supplier_product_prices WHERE id = NEW.supersedes_id
        AND supplier_product_id = NEW.supplier_product_id) THEN
    RAISE EXCEPTION 'Correction must reference a price of the same supplier product';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_supplier_product_price
  BEFORE INSERT OR UPDATE OR DELETE ON public.supplier_product_prices
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_product_price();

CREATE OR REPLACE FUNCTION public.can_edit_inventory()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.user_is_owner() OR public.user_has_permission('inventory','edit');
$$;

CREATE OR REPLACE FUNCTION public.supplier_name_key(_s text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT btrim(regexp_replace(lower(coalesce(_s,'')), '[^a-z0-9]+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.supplier_cost_per_base(_cost numeric, _size numeric, _unit text)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _cost > 0 AND _size > 0 AND _unit IN ('each','g','kg','ml','L')
              THEN _cost / (_size * public.unit_factor(_unit)) END;
$$;

CREATE OR REPLACE FUNCTION public.import_jnum(_j jsonb, _k text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE t text := _j->>_k;
BEGIN
  IF t IS NULL OR btrim(t) = '' THEN RETURN NULL; END IF;
  IF t !~ '^\s*-?\d+(\.\d+)?\s*$' THEN RAISE EXCEPTION '% is not a number', _k; END IF;
  RETURN t::numeric;
END $$;

CREATE OR REPLACE FUNCTION public.import_juuid(_j jsonb, _k text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE t text := _j->>_k;
BEGIN
  IF t IS NULL OR t = '' THEN RETURN NULL; END IF;
  IF t !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION '% is not a valid id', _k; END IF;
  RETURN t::uuid;
END $$;

CREATE OR REPLACE FUNCTION public.preview_supplier_products(p_rows jsonb)
RETURNS TABLE(row_no int, status text, supplier_product_id uuid, existing_ingredient_id uuid,
              existing_code text, existing_name text, existing_pack_size numeric, existing_pack_unit text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE rid uuid := public.get_user_restaurant_id(); r jsonb; m record; found_m boolean;
        v_code text; v_size numeric; v_unit text; v_ing uuid; v_sup uuid; v_key text;
BEGIN
  IF rid IS NULL OR NOT public.can_edit_inventory() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) > 2000 THEN
    RAISE EXCEPTION 'Rows must be an array of at most 2000'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    row_no := (public.import_jnum(r,'row'))::int;
    v_sup := public.import_juuid(r,'supplier_id'); v_ing := public.import_juuid(r,'ingredient_id');
    v_code := nullif(btrim(r->>'product_code'),''); v_size := public.import_jnum(r,'pack_size');
    v_unit := nullif(btrim(r->>'pack_unit'),''); v_key := public.supplier_name_key(r->>'product_name');
    supplier_product_id := NULL; existing_ingredient_id := NULL; existing_code := NULL;
    existing_name := NULL; existing_pack_size := NULL; existing_pack_unit := NULL;
    IF v_sup IS NULL OR NOT EXISTS (SELECT 1 FROM suppliers WHERE id = v_sup AND restaurant_id = rid) THEN
      status := 'new'; RETURN NEXT; CONTINUE;
    END IF;
    found_m := false;
    IF v_code IS NOT NULL THEN
      SELECT * INTO m FROM supplier_products sp WHERE sp.restaurant_id = rid AND sp.supplier_id = v_sup
        AND lower(sp.product_code) = lower(v_code) AND sp.archived_at IS NULL;
      found_m := FOUND;
    END IF;
    IF NOT found_m THEN
      SELECT * INTO m FROM supplier_products sp WHERE sp.restaurant_id = rid AND sp.supplier_id = v_sup
        AND sp.normalized_name = v_key
        AND coalesce(sp.pack_size,-1) = coalesce(v_size,-1)
        AND coalesce(lower(sp.pack_unit),'') = coalesce(lower(v_unit),'')
        AND sp.archived_at IS NULL;
      found_m := FOUND;
    END IF;
    IF NOT found_m THEN
      status := CASE WHEN EXISTS (SELECT 1 FROM supplier_products sp WHERE sp.restaurant_id = rid
                       AND sp.supplier_id = v_sup AND sp.archived_at IS NULL AND sp.normalized_name = v_key)
                     THEN 'new_pack_variant' ELSE 'new' END;
      RETURN NEXT; CONTINUE;
    END IF;
    supplier_product_id := m.id; existing_ingredient_id := m.ingredient_id;
    existing_code := m.product_code; existing_name := m.product_name;
    existing_pack_size := m.pack_size; existing_pack_unit := m.pack_unit;
    status := CASE
      WHEN v_ing IS DISTINCT FROM m.ingredient_id THEN 'linked_to_other_item'
      WHEN m.pack_size IS DISTINCT FROM v_size OR lower(m.pack_unit) IS DISTINCT FROM lower(v_unit) THEN 'pack_differs'
      WHEN lower(coalesce(m.product_code,'')) <> lower(coalesce(v_code,'')) THEN 'code_differs'
      WHEN m.normalized_name <> v_key THEN 'description_differs'
      ELSE 'exact' END;
    RETURN NEXT;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.apply_stock_list_import(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rid uuid := public.get_user_restaurant_id();
  v_date date; s jsonb; r jsonb; it jsonb; pr jsonb; sp jsonb;
  sup_refs jsonb := '{}'; item_refs jsonb := '{}';
  v_sup uuid; v_ing uuid; v_sp uuid; v_row int; ex record; lp record;
  v_code text; v_size numeric; v_unit text; v_cost numeric; v_base numeric; v_name text;
  n_sup int := 0; n_new int := 0; n_match int := 0; n_skip int := 0; n_price int := 0;
  n_sp_new int := 0; n_sp_link int := 0; n_spp int := 0; n_spp_same int := 0; res jsonb;
BEGIN
  IF rid IS NULL OR NOT public.can_edit_inventory() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF jsonb_typeof(p_payload->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'rows') > 2000 THEN
    RAISE EXCEPTION 'rows must be an array of at most 2000'; END IF;
  IF coalesce(p_payload->>'effective_date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'effective_date must be YYYY-MM-DD'; END IF;
  v_date := (p_payload->>'effective_date')::date;
  IF v_date > current_date THEN RAISE EXCEPTION 'effective_date cannot be in the future'; END IF;

  FOR s IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'suppliers','[]'::jsonb)) LOOP
    v_name := btrim(regexp_replace(coalesce(s->>'name',''), '\s+', ' ', 'g'));
    IF v_name = '' OR length(v_name) > 200 OR coalesce(s->>'ref','') = '' THEN
      RAISE EXCEPTION 'Invalid new supplier'; END IF;
    INSERT INTO suppliers (name, restaurant_id) VALUES (v_name, rid) RETURNING id INTO v_sup;
    sup_refs := sup_refs || jsonb_build_object(s->>'ref', v_sup); n_sup := n_sup + 1;
  END LOOP;

  FOR r IN SELECT * FROM jsonb_array_elements(p_payload->'rows') LOOP
    v_row := 0;
    BEGIN
      v_row := coalesce((public.import_jnum(r,'row'))::int, 0);
      IF coalesce((r->>'skip')::boolean, false) THEN n_skip := n_skip + 1; CONTINUE; END IF;

      v_sup := NULL;
      IF jsonb_typeof(r->'supplier') = 'object' AND r->'supplier' ? 'id' THEN
        v_sup := public.import_juuid(r->'supplier','id');
        IF NOT EXISTS (SELECT 1 FROM suppliers WHERE id = v_sup AND restaurant_id = rid) THEN
          RAISE EXCEPTION 'supplier not in this restaurant'; END IF;
      ELSIF jsonb_typeof(r->'supplier') = 'object' AND r->'supplier' ? 'ref' THEN
        v_sup := (sup_refs->>(r->'supplier'->>'ref'))::uuid;
        IF v_sup IS NULL THEN RAISE EXCEPTION 'unknown supplier reference'; END IF;
      END IF;

      it := r->'item';
      IF jsonb_typeof(it) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'row has no item'; END IF;
      IF it ? 'follow_ref' THEN
        v_ing := (item_refs->>(it->>'follow_ref'))::uuid;
        IF v_ing IS NULL THEN RAISE EXCEPTION 'duplicate row refers to an item not yet created'; END IF;
        n_match := n_match + 1;
      ELSIF it ? 'id' THEN
        v_ing := public.import_juuid(it,'id');
        IF NOT EXISTS (SELECT 1 FROM ingredients WHERE id = v_ing AND restaurant_id = rid) THEN
          RAISE EXCEPTION 'inventory item not in this restaurant'; END IF;
        UPDATE ingredients SET
          supplier_id = coalesce(supplier_id, v_sup),
          category    = coalesce(category, nullif(it->>'category','')),
          item_group  = coalesce(item_group, nullif(it->>'item_group',''))
        WHERE id = v_ing AND ((supplier_id IS NULL AND v_sup IS NOT NULL)
           OR (category IS NULL AND nullif(it->>'category','') IS NOT NULL)
           OR (item_group IS NULL AND nullif(it->>'item_group','') IS NOT NULL));
        IF it ? 'ref' THEN item_refs := item_refs || jsonb_build_object(it->>'ref', v_ing); END IF;
        n_match := n_match + 1;
      ELSIF it ? 'ref' THEN
        v_name := btrim(regexp_replace(coalesce(it->>'name',''), '\s+', ' ', 'g'));
        IF v_name = '' OR length(v_name) > 200 THEN RAISE EXCEPTION 'invalid item name'; END IF;
        IF coalesce(it->>'unit','') NOT IN ('each','g','kg','ml','L') THEN RAISE EXCEPTION 'unknown unit'; END IF;
        IF coalesce(it->>'storage_type','') NOT IN ('freezer','fridge','dry') THEN RAISE EXCEPTION 'invalid storage type'; END IF;
        INSERT INTO ingredients (name, restaurant_id, unit, storage_type, item_type, item_group,
          category, supplier_id, purchase_unit, pack_size, pack_unit, cost_per_pack, default_cost_price)
        VALUES (v_name, rid, (it->>'unit')::unit_type, (it->>'storage_type')::storage_type,
          coalesce(nullif(it->>'item_type',''),'recipe_ingredient'), nullif(it->>'item_group',''),
          nullif(it->>'category',''), v_sup, nullif(it->>'purchase_unit',''),
          public.import_jnum(it,'pack_size'), nullif(it->>'pack_unit',''), NULL, NULL)
        RETURNING id INTO v_ing;
        item_refs := item_refs || jsonb_build_object(it->>'ref', v_ing); n_new := n_new + 1;
      ELSE
        RAISE EXCEPTION 'row has no item';
      END IF;

      pr := r->'price';
      IF jsonb_typeof(pr) = 'object' THEN
        v_cost := public.import_jnum(pr,'cost_per_pack'); v_size := public.import_jnum(pr,'pack_size');
        v_unit := pr->>'pack_unit';
        IF coalesce(v_unit,'') NOT IN ('each','g','kg','ml','L') THEN RAISE EXCEPTION 'unknown pack unit'; END IF;
        IF NOT (coalesce(v_cost,0) > 0 AND coalesce(v_size,0) > 0) THEN RAISE EXCEPTION 'invalid price or pack size'; END IF;
        IF coalesce((r->>'set_master_price')::boolean, true)
           AND NOT EXISTS (SELECT 1 FROM ingredient_prices WHERE ingredient_id = v_ing) THEN
          PERFORM public.set_initial_import_price(v_ing, v_cost, v_size, v_unit, v_cost / v_size);
          n_price := n_price + 1;
        END IF;
      ELSE
        pr := NULL;
      END IF;

      sp := r->'supplier_product';
      IF jsonb_typeof(sp) = 'object' THEN
        IF v_sup IS NULL THEN RAISE EXCEPTION 'supplier product needs a supplier'; END IF;
        v_name := btrim(coalesce(sp->>'product_name',''));
        IF v_name = '' OR length(v_name) > 300 THEN RAISE EXCEPTION 'invalid supplier description'; END IF;
        v_code := nullif(btrim(sp->>'product_code'),'');
        IF length(v_code) > 100 THEN RAISE EXCEPTION 'product code too long'; END IF;
        v_size := public.import_jnum(sp,'pack_size'); v_unit := nullif(btrim(sp->>'pack_unit'),'');
        IF v_unit IS NOT NULL AND v_unit NOT IN ('each','g','kg','ml','L') THEN RAISE EXCEPTION 'unknown pack unit'; END IF;

        IF sp->>'resolution' = 'link_existing' THEN
          v_sp := public.import_juuid(sp,'supplier_product_id');
          SELECT * INTO ex FROM supplier_products WHERE id = v_sp AND restaurant_id = rid
            AND supplier_id = v_sup AND archived_at IS NULL;
          IF NOT FOUND THEN RAISE EXCEPTION 'supplier product to link not found'; END IF;
          IF ex.ingredient_id <> v_ing THEN RAISE EXCEPTION 'supplier product belongs to another inventory item'; END IF;
          IF ex.pack_size IS DISTINCT FROM v_size OR ex.pack_unit IS DISTINCT FROM v_unit THEN
            RAISE EXCEPTION 'pack differs from existing supplier product'; END IF;
          IF lower(coalesce(ex.product_code,'')) <> lower(coalesce(v_code,''))
             AND NOT coalesce(jsonb_typeof(sp->'reviewed') = 'array' AND sp->'reviewed' ? 'code', false) THEN
            RAISE EXCEPTION 'product code differs and was not confirmed'; END IF;
          IF ex.normalized_name <> public.supplier_name_key(v_name)
             AND NOT coalesce(jsonb_typeof(sp->'reviewed') = 'array' AND sp->'reviewed' ? 'description', false) THEN
            RAISE EXCEPTION 'description differs and was not confirmed'; END IF;
          n_sp_link := n_sp_link + 1;
        ELSIF coalesce(sp->>'resolution','new') = 'new' THEN
          IF EXISTS (SELECT 1 FROM supplier_products x WHERE x.restaurant_id = rid AND x.supplier_id = v_sup
                       AND x.archived_at IS NULL
                       AND ((v_code IS NOT NULL AND lower(x.product_code) = lower(v_code))
                         OR (x.normalized_name = public.supplier_name_key(v_name)
                             AND coalesce(x.pack_size,-1) = coalesce(v_size,-1)
                             AND coalesce(lower(x.pack_unit),'') = coalesce(lower(v_unit),'')))) THEN
            RAISE EXCEPTION 'supplier product conflict needs review'; END IF;
          INSERT INTO supplier_products (restaurant_id, supplier_id, ingredient_id, product_name,
            normalized_name, product_code, pack_size, pack_unit, purchase_unit, created_by)
          VALUES (rid, v_sup, v_ing, v_name, public.supplier_name_key(v_name), v_code,
            v_size, v_unit, nullif(sp->>'purchase_unit',''), auth.uid())
          RETURNING id INTO v_sp;
          n_sp_new := n_sp_new + 1;
        ELSE
          RAISE EXCEPTION 'invalid resolution';
        END IF;

        IF pr IS NOT NULL THEN
          v_cost := public.import_jnum(pr,'cost_per_pack'); v_size := public.import_jnum(pr,'pack_size');
          v_unit := pr->>'pack_unit';
          v_base := public.supplier_cost_per_base(v_cost, v_size, v_unit);
          IF v_base IS NULL THEN RAISE EXCEPTION 'invalid supplier price'; END IF;
          SELECT * INTO lp FROM supplier_product_prices WHERE supplier_product_id = v_sp
            ORDER BY effective_date DESC, created_at DESC LIMIT 1;
          IF FOUND AND lp.cost_per_pack = v_cost AND lp.pack_size = v_size AND lp.pack_unit = v_unit THEN
            n_spp_same := n_spp_same + 1;
          ELSE
            INSERT INTO supplier_product_prices (restaurant_id, supplier_product_id, effective_date,
              cost_per_pack, pack_size, pack_unit, base_unit, cost_per_base_unit, source, created_by)
            VALUES (rid, v_sp, v_date, v_cost, v_size, v_unit, public.normalize_unit(v_unit),
              v_base, 'initial_import', auth.uid());
            n_spp := n_spp + 1;
          END IF;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Row %: %', v_row, SQLERRM;
    END;
  END LOOP;

  res := jsonb_build_object('suppliers_created', n_sup, 'items_created', n_new, 'items_matched', n_match,
    'rows_skipped', n_skip, 'starting_prices', n_price, 'supplier_products_created', n_sp_new,
    'supplier_products_linked', n_sp_link, 'supplier_prices_added', n_spp,
    'supplier_prices_unchanged', n_spp_same);
  PERFORM public.log_audit_event(rid, 'stock_list_import', 'Stock list imported', res);
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION public.correct_supplier_product_price(
  p_price_id uuid, p_cost_per_pack numeric, p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; nid uuid; v_base numeric;
BEGIN
  IF NOT public.can_edit_inventory() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO o FROM supplier_product_prices
   WHERE id = p_price_id AND restaurant_id = public.get_user_restaurant_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Price not found'; END IF;
  IF EXISTS (SELECT 1 FROM supplier_product_prices WHERE supersedes_id = o.id) THEN
    RAISE EXCEPTION 'This price was already corrected; correct the latest revision'; END IF;
  IF coalesce(btrim(p_note),'') = '' OR length(p_note) > 500 THEN
    RAISE EXCEPTION 'A correction note (max 500 chars) is required'; END IF;
  v_base := public.supplier_cost_per_base(p_cost_per_pack, o.pack_size, o.pack_unit);
  IF v_base IS NULL THEN RAISE EXCEPTION 'Corrected cost must be positive'; END IF;
  INSERT INTO supplier_product_prices (restaurant_id, supplier_product_id, effective_date, cost_per_pack,
    pack_size, pack_unit, base_unit, cost_per_base_unit, source, document_id, purchase_order_id,
    supersedes_id, note, created_by)
  VALUES (o.restaurant_id, o.supplier_product_id, o.effective_date, p_cost_per_pack, o.pack_size,
    o.pack_unit, public.normalize_unit(o.pack_unit), v_base, 'correction', o.document_id,
    o.purchase_order_id, o.id, btrim(p_note), auth.uid())
  RETURNING id INTO nid;
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.set_supplier_product_archived(p_id uuid, p_archived boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_edit_inventory() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE supplier_products
     SET archived_at = CASE WHEN p_archived THEN now() END,
         archived_by = CASE WHEN p_archived THEN auth.uid() END
   WHERE id = p_id AND restaurant_id = public.get_user_restaurant_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ingredient_dependencies(p_ingredient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'price_entries', (SELECT count(*) FROM ingredient_prices WHERE ingredient_id = p_ingredient_id),
    'supplier_products', (SELECT count(*) FROM supplier_products WHERE ingredient_id = p_ingredient_id)
  ) INTO r;
  RETURN r || jsonb_build_object('can_delete',
    (r->>'recipe_lines')::int = 0 AND (r->>'linked_dish')::int = 0
    AND (r->>'purchase_lines')::int = 0 AND (r->>'adjustments')::int = 0
    AND (r->>'count_lines')::int = 0 AND (r->>'stock_on_hand')::int = 0
    AND (r->>'price_entries')::int <= 1
    AND (r->>'supplier_products')::int = 0);
END; $function$;

REVOKE ALL ON FUNCTION
  public.guard_supplier_product(), public.guard_supplier_product_price(),
  public.can_edit_inventory(), public.supplier_cost_per_base(numeric, numeric, text),
  public.supplier_name_key(text), public.import_jnum(jsonb, text), public.import_juuid(jsonb, text),
  public.preview_supplier_products(jsonb), public.apply_stock_list_import(jsonb),
  public.correct_supplier_product_price(uuid, numeric, text),
  public.set_supplier_product_archived(uuid, boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.can_edit_inventory(), public.supplier_cost_per_base(numeric, numeric, text),
  public.supplier_name_key(text), public.import_jnum(jsonb, text), public.import_juuid(jsonb, text),
  public.preview_supplier_products(jsonb), public.apply_stock_list_import(jsonb),
  public.correct_supplier_product_price(uuid, numeric, text),
  public.set_supplier_product_archived(uuid, boolean)
TO authenticated;