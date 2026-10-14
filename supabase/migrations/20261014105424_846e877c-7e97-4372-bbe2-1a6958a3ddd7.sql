CREATE OR REPLACE FUNCTION public.apply_stock_list_import(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rid uuid := public.get_user_restaurant_id();
  v_date date; s jsonb; r jsonb; it jsonb; pr jsonb; sp jsonb;
  sup_refs jsonb := '{}'; item_refs jsonb := '{}';
  v_sup uuid; v_ing uuid; v_sp uuid; v_row int; ex record; lp record; ing record;
  v_code text; v_size numeric; v_unit text; v_cost numeric; v_base numeric; v_name text; v_newpack numeric;
  n_sup int := 0; n_new int := 0; n_match int := 0; n_skip int := 0; n_price int := 0;
  n_sp_new int := 0; n_sp_link int := 0; n_spp int := 0; n_spp_same int := 0; n_spp_kept int := 0;
  n_master int := 0; n_master_hist int := 0;
  res jsonb;
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

      -- Optional, explicit master-cost update for an existing item (never automatic).
      IF coalesce((r->>'update_master_price')::boolean, false) THEN
        IF pr IS NULL THEN RAISE EXCEPTION 'master cost update needs a price'; END IF;
        IF NOT (it ? 'id') THEN RAISE EXCEPTION 'master cost update is only for existing items'; END IF;
        SELECT * INTO ing FROM ingredients WHERE id = v_ing AND restaurant_id = rid;
        v_cost := public.import_jnum(pr,'cost_per_pack'); v_size := public.import_jnum(pr,'pack_size');
        v_unit := pr->>'pack_unit';
        v_base := public.supplier_cost_per_base(v_cost, v_size, v_unit);
        IF v_base IS NULL THEN RAISE EXCEPTION 'invalid price for master cost'; END IF;
        IF coalesce(ing.pack_size,0) <= 0 OR public.unit_factor(ing.pack_unit) IS NULL THEN
          RAISE EXCEPTION 'item pack format unknown; update its cost in the item editor'; END IF;
        IF public.normalize_unit(ing.pack_unit) IS DISTINCT FROM public.normalize_unit(v_unit)
           OR public.get_ingredient_cost_unit(v_ing) IS DISTINCT FROM public.normalize_unit(v_unit) THEN
          RAISE EXCEPTION 'units not comparable (item % vs list %)', ing.pack_unit, v_unit; END IF;
        v_newpack := v_base * ing.pack_size * public.unit_factor(ing.pack_unit);
        IF v_date < current_date THEN
          -- Backdated: allowed only as history between existing prices. A newer master price must
          -- already exist, so today's recipe cost (and the latest dated entry) stay unchanged.
          IF NOT EXISTS (SELECT 1 FROM ingredient_prices WHERE ingredient_id = v_ing AND effective_date > v_date) THEN
            RAISE EXCEPTION 'no newer master price after %: a backdated entry would become today''s recipe cost. Use today''s date to change the current cost', v_date; END IF;
          PERFORM public.insert_ingredient_price_row(v_ing, v_date, 'backdated', v_newpack / ing.pack_size,
            v_base, ing.pack_size, ing.pack_unit, v_newpack, 'Stock list import (backdated)', auth.uid());
          n_master_hist := n_master_hist + 1;
        ELSE
          IF EXISTS (SELECT 1 FROM ingredient_prices WHERE ingredient_id = v_ing AND effective_date > v_date) THEN
            RAISE EXCEPTION 'a newer master price exists after %', v_date; END IF;
          -- Today: existing price-history trigger records exactly one current entry.
          UPDATE ingredients SET cost_per_pack = v_newpack, default_cost_price = v_newpack / ing.pack_size
           WHERE id = v_ing;
          n_master := n_master + 1;
        END IF;
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

        IF pr IS NOT NULL AND NOT coalesce((r->>'record_supplier_price')::boolean, true) THEN
          n_spp_kept := n_spp_kept + 1;
        ELSIF pr IS NOT NULL THEN
          v_cost := public.import_jnum(pr,'cost_per_pack'); v_size := public.import_jnum(pr,'pack_size');
          v_unit := pr->>'pack_unit';
          v_base := public.supplier_cost_per_base(v_cost, v_size, v_unit);
          IF v_base IS NULL THEN RAISE EXCEPTION 'invalid supplier price'; END IF;
          SELECT * INTO lp FROM supplier_product_prices WHERE supplier_product_id = v_sp
             AND effective_date <= v_date
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
    'supplier_prices_unchanged', n_spp_same, 'supplier_prices_kept', n_spp_kept,
    'master_costs_updated', n_master, 'master_history_added', n_master_hist);
  PERFORM public.log_audit_event(rid, 'stock_list_import', 'Stock list imported', res);
  RETURN res;
END $function$;