# Final migration: supplier products, supplier price history and an all-or-nothing stock import (not applied)

## Read-only check results (latest)

These were checked against the live functions: `record_ingredient_price_history`, `set_initial_import_price`, `insert_ingredient_price_row` and `get_ingredient_base_cost`.

1. **New item without a price stays unknown.**
   - When an item is created with no pack cost and no default cost, the history trigger finds a cost of 0, treats it as missing and writes no history row.
   - `default_cost_price` and `cost_per_pack` stay NULL. Confirmed correct, no change needed.
2. **New item with a known pack cost gets exactly one history row.**
   - Creating the item writes no row, because there is no cost yet.
   - `set_initial_import_price` then updates the item once. The trigger fires once and writes 1 row with source `initial_import`, note "Initial stock list import", and cost per base unit = pack cost ÷ (pack size × 1000 for kg/L, or 1 otherwise). That is correctly normalized.
   - A second call is refused, because the item now has price history.
3. **Gap found: master per-unit cost left blank.**
   - The design passed `p_unit_cost = NULL`, the same as today's importer. As a result `default_cost_price` stays NULL even though the pack cost is known.
   - The history row's legacy `cost_price` column is also stored as 0.
   - Dish costing still works, because it reads pack cost / cost per base unit. But any screen reading only `default_cost_price` would show Missing.
   - **Correction:** pass the cost per pack unit (pack cost ÷ pack size).
4. **Gap found: unit capitalisation.** The existing master cost calculation recognises only `kg`, `L`, `g`, `ml` and `each`, and is case-sensitive. A pack unit like `l` or `KG` would be treated as ×1, which is wrong. **Correction:** accept only those exact spellings for the master starting price.
5. **Gap found: description matching ignored pack size.**
   - The preview matched on description alone, so a 5 kg and a 10 kg product with the same description were flagged as one product.
   - The import's "new" check would also wrongly block a genuine new pack size.
   - **Correction:** match description together with pack. The same description with a different pack is shown as a new pack variant and created separately. A code match with a different pack remains a conflict.
6. **Gap found: link-to-existing did not require review of differences.**
   - `link_existing` checked that the item and pack were the same, but accepted a different code or description without proof that you had reviewed it.
   - **Correction:** the import recalculates the differences itself and requires each one to be listed in `reviewed`. Otherwise it rejects the whole import. The preview reports "exact" only when code, description and pack all match.

### Exact SQL corrections (replace the matching parts of sections 4 and 5 below)

**Section 4 — `preview_supplier_products`: replace the `SELECT ... INTO by_desc` and the `status := CASE ...` with:**

```sql
    SELECT * INTO by_desc FROM supplier_products WHERE restaurant_id = rid AND supplier_id = v_sup
      AND normalized_name = public.supplier_name_key(r->>'product_name')
      AND coalesce(pack_size,-1) = coalesce(v_size,-1)
      AND coalesce(lower(pack_unit),'') = coalesce(lower(v_unit),'')
      AND archived_at IS NULL;
    IF by_code.id IS NULL AND by_desc.id IS NULL THEN
      status := CASE WHEN EXISTS (SELECT 1 FROM supplier_products WHERE restaurant_id = rid
                       AND supplier_id = v_sup AND archived_at IS NULL
                       AND normalized_name = public.supplier_name_key(r->>'product_name'))
                     THEN 'new_pack_variant' ELSE 'new' END;
      RETURN NEXT; CONTINUE;
    END IF;
    -- (existing assignment lines unchanged)
    status := CASE
      WHEN v_ing IS DISTINCT FROM by_desc.ingredient_id THEN 'linked_to_other_item'
      WHEN by_desc.pack_size IS DISTINCT FROM v_size
        OR lower(by_desc.pack_unit) IS DISTINCT FROM lower(v_unit) THEN 'pack_differs'
      WHEN lower(coalesce(by_desc.product_code,'')) <> lower(coalesce(v_code,'')) THEN 'code_differs'
      WHEN by_desc.normalized_name <> public.supplier_name_key(r->>'product_name') THEN 'description_differs'
      ELSE 'exact' END;
```

**Section 5 — `apply_stock_list_import`, master starting price: replace the price block with:**

```sql
      IF pr IS NOT NULL AND jsonb_typeof(pr) = 'object'
         AND NOT EXISTS (SELECT 1 FROM ingredient_prices WHERE ingredient_id = v_ing) THEN
        v_cost := public.jnum(pr,'cost_per_pack'); v_size := public.jnum(pr,'pack_size');
        v_unit := pr->>'pack_unit';
        IF v_unit NOT IN ('each','g','kg','ml','L') THEN RAISE EXCEPTION 'unknown pack unit'; END IF;
        IF NOT (v_cost > 0 AND v_size > 0) THEN RAISE EXCEPTION 'invalid price or pack size'; END IF;
        PERFORM public.set_initial_import_price(v_ing, v_cost, v_size, v_unit, v_cost / v_size);
        n_price := n_price + 1;
      END IF;
```

**Section 5, `link_existing`: insert after the pack check:**

```sql
          IF lower(coalesce(ex.product_code,'')) <> lower(coalesce(v_code,''))
             AND NOT coalesce(sp->'reviewed' ? 'code', false) THEN
            RAISE EXCEPTION 'product code differs and was not confirmed'; END IF;
          IF ex.normalized_name <> public.supplier_name_key(v_name)
             AND NOT coalesce(sp->'reviewed' ? 'description', false) THEN
            RAISE EXCEPTION 'description differs and was not confirmed'; END IF;
```

**Section 5, `new` resolution: replace the conflict check with (pack-aware):**

```sql
          IF EXISTS (SELECT 1 FROM supplier_products WHERE restaurant_id = rid AND supplier_id = v_sup
                       AND archived_at IS NULL
                       AND ((v_code IS NOT NULL AND lower(product_code) = lower(v_code))
                         OR (normalized_name = public.supplier_name_key(v_name)
                             AND coalesce(pack_size,-1) = coalesce(v_size,-1)
                             AND coalesce(lower(pack_unit),'') = coalesce(lower(v_unit),'')))) THEN
            RAISE EXCEPTION 'supplier product conflict needs review'; END IF;
```

**Review screen:**
- **Link to existing:** sends `reviewed: ["code","description"]` listing only the differences you actually ticked on that row.
- **New pack variant:** shown as information only and created as a separate product.

**Extra checks after applying:**
- A new item with €12 per 5 kg gives `default_cost_price` 2.40, one `initial_import` row and cost per base unit 0.0024.
- A new item with no price keeps all cost fields NULL and gets no history row.
- 5 kg and 10 kg products with the same description become two separate supplier products.
- Linking to an existing product whose code differs, without confirming the difference, is rejected.

Nothing runs until you approve. Recipe costing, master item prices, stock levels, POS mappings, documents, purchase orders and sales are not changed.

## What this version fixes

1. **The whole import is one transaction.** One new database step, `apply_stock_list_import`, does all of these in a single transaction:
   - creates new suppliers
   - creates new master items, using the same fields as today's importer
   - fills only the empty supplier/category/group fields on matched items, as today
   - records starting prices through the existing `set_initial_import_price`, reused rather than copied
   - saves supplier product links and supplier prices

   If any row fails, nothing from the import remains: no items, suppliers, links or prices.
2. **Corrected prices store the cost per base unit.** Corrections calculate it with the existing conversion rules (`normalize_unit` / `unit_factor`), for example €12 per 5 kg becomes €0.0024 per g. Imports calculate it on the server the same way. Values sent by the browser are ignored. A unit those rules don't recognise is rejected and never stored as blank.
3. **Conflicts are always flagged, never resolved silently.** A new read-only check, `preview_supplier_products`, labels every row on the review screen as one of:
   - **New**
   - **Exact match**
   - **Code differs**
   - **Description differs**
   - **Pack differs**
   - **Linked to another item**

   The import refuses to start while any conflict is unresolved. The only ways to resolve a conflict are:
   - **Link to existing**: allowed only when it's the same master item and the same pack. The existing code and description are kept and never overwritten.
   - **Skip row.**

   A supplier product is never moved to a different master item.
4. **The delete/archive change is in full below.** `ingredient_dependencies` now counts supplier products. Any count above zero means the item is archived, never deleted. `delete_or_archive_ingredient` already relies on this result, so its code stays exactly as it is.
5. **Checked functions:**
   - All of them are `SECURITY DEFINER` with a fixed `search_path`.
   - Running them is revoked from `PUBLIC` and `anon` and granted only to `authenticated`.
   - Each one checks the caller's restaurant (`get_user_restaurant_id()`) on every ID it receives.
   - Each one requires Owner or Inventory Edit, the same rule `set_initial_import_price` uses.
   - Every row field is checked for shape (UUID, positive number, known unit, allowed enum value, text length) before use.
   - A malformed row raises an error naming the row and rolls back the whole import.

## Trade-offs you can't avoid

- **Large files take one longer save.** Nothing is saved until the end, so if the save fails you fix the row and confirm again. Batches are capped at 2,000 rows.
- **New items are created by the server step.** The browser no longer writes them directly. The server step writes the same columns, the existing item triggers (including price history) still run, and `set_initial_import_price` is called unchanged. The browser's ingredient-creation hook stays as it is for normal Add Item.
- **Linked suppliers can't be deleted.** A supplier with supplier products can't be deleted, because suppliers have no archive option and I'm not adding one in this change.
- **Supplier prices don't affect dish costing.** They are evidence for supplier comparison and invoices only. The master item's price is still set through its existing price history.

## Executable SQL

```sql
-- ========== 1. Tables ==========
CREATE TABLE public.supplier_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  normalized_name text NOT NULL,
  product_code text,
  pack_size numeric,
  pack_unit text,
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
  pack_unit text NOT NULL,
  base_unit text NOT NULL,
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
-- No write policies on either table: writes go only through the functions below.

-- ========== 2. Integrity triggers ==========
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

-- ========== 3. Helpers ==========
-- Same rule as set_initial_import_price.
CREATE OR REPLACE FUNCTION public.can_edit_inventory()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.user_is_owner() OR public.user_has_permission('inventory','edit');
$$;

CREATE OR REPLACE FUNCTION public.supplier_name_key(_s text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT btrim(regexp_replace(lower(coalesce(_s,'')), '[^a-z0-9]+', ' ', 'g'));
$$;

-- Existing conversion rules; NULL when the unit is unknown.
CREATE OR REPLACE FUNCTION public.supplier_cost_per_base(_cost numeric, _size numeric, _unit text)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _cost > 0 AND _size > 0 AND public.unit_factor(_unit) IS NOT NULL
              THEN _cost / (_size * public.unit_factor(_unit)) END;
$$;

CREATE OR REPLACE FUNCTION public.jnum(_j jsonb, _k text)  -- safe numeric read
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE t text := _j->>_k;
BEGIN
  IF t IS NULL OR btrim(t) = '' THEN RETURN NULL; END IF;
  IF t !~ '^\s*-?\d+(\.\d+)?\s*$' THEN RAISE EXCEPTION '% is not a number', _k; END IF;
  RETURN t::numeric;
END $$;

CREATE OR REPLACE FUNCTION public.juuid(_j jsonb, _k text)  -- safe uuid read
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE t text := _j->>_k;
BEGIN
  IF t IS NULL OR t = '' THEN RETURN NULL; END IF;
  IF t !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION '% is not a valid id', _k; END IF;
  RETURN t::uuid;
END $$;

-- ========== 4. Read-only conflict preview ==========
-- p_rows: [{row, supplier_id, ingredient_id (null for new item), product_name, product_code, pack_size, pack_unit}]
CREATE OR REPLACE FUNCTION public.preview_supplier_products(p_rows jsonb)
RETURNS TABLE(row_no int, status text, supplier_product_id uuid, existing_ingredient_id uuid,
              existing_code text, existing_name text, existing_pack_size numeric, existing_pack_unit text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE rid uuid := public.get_user_restaurant_id(); r jsonb; by_code record; by_desc record;
        v_code text; v_size numeric; v_unit text; v_ing uuid; v_sup uuid;
BEGIN
  IF rid IS NULL OR NOT public.can_edit_inventory() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 2000 THEN
    RAISE EXCEPTION 'Rows must be an array of at most 2000'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    row_no := (public.jnum(r,'row'))::int;
    v_sup := public.juuid(r,'supplier_id'); v_ing := public.juuid(r,'ingredient_id');
    v_code := nullif(btrim(r->>'product_code'),''); v_size := public.jnum(r,'pack_size');
    v_unit := nullif(btrim(r->>'pack_unit'),'');
    supplier_product_id := NULL; existing_ingredient_id := NULL; existing_code := NULL;
    existing_name := NULL; existing_pack_size := NULL; existing_pack_unit := NULL;
    IF v_sup IS NULL OR NOT EXISTS (SELECT 1 FROM suppliers WHERE id = v_sup AND restaurant_id = rid) THEN
      status := 'new'; RETURN NEXT; CONTINUE;  -- new supplier => new product
    END IF;
    by_code := NULL; by_desc := NULL;
    IF v_code IS NOT NULL THEN
      SELECT * INTO by_code FROM supplier_products WHERE restaurant_id = rid AND supplier_id = v_sup
        AND lower(product_code) = lower(v_code) AND archived_at IS NULL;
    END IF;
    SELECT * INTO by_desc FROM supplier_products WHERE restaurant_id = rid AND supplier_id = v_sup
      AND normalized_name = public.supplier_name_key(r->>'product_name') AND archived_at IS NULL
      ORDER BY created_at LIMIT 1;
    IF by_code.id IS NULL AND by_desc.id IS NULL THEN status := 'new'; RETURN NEXT; CONTINUE; END IF;
    IF by_code.id IS NOT NULL THEN by_desc := by_code; END IF;  -- report the code match
    supplier_product_id := by_desc.id; existing_ingredient_id := by_desc.ingredient_id;
    existing_code := by_desc.product_code; existing_name := by_desc.product_name;
    existing_pack_size := by_desc.pack_size; existing_pack_unit := by_desc.pack_unit;
    status := CASE
      WHEN v_ing IS DISTINCT FROM by_desc.ingredient_id THEN 'linked_to_other_item'
      WHEN by_desc.pack_size IS DISTINCT FROM v_size
        OR lower(by_desc.pack_unit) IS DISTINCT FROM lower(v_unit) THEN 'pack_differs'
      WHEN by_desc.product_code IS DISTINCT FROM v_code
        AND lower(coalesce(by_desc.product_code,'')) <> lower(coalesce(v_code,'')) THEN 'code_differs'
      WHEN by_desc.normalized_name <> public.supplier_name_key(r->>'product_name') THEN 'description_differs'
      ELSE 'exact' END;
    RETURN NEXT;
  END LOOP;
END $$;

-- ========== 5. All-or-nothing import ==========
-- p_payload = {
--   effective_date: 'YYYY-MM-DD',
--   suppliers: [{ref, name}],                                   -- new suppliers only
--   rows: [{
--     row, skip?,
--     supplier: {id} | {ref} | null,
--     item: {id} | {ref, name, unit, storage_type, item_type, item_group, category,
--                   purchase_unit, pack_size, pack_unit}       -- first row with a ref creates it
--           | {follow_ref},                                     -- duplicate row in file
--     price: {cost_per_pack, pack_size, pack_unit} | null,
--     supplier_product: {product_name, product_code, pack_size, pack_unit, purchase_unit,
--                        resolution: 'new' | 'link_existing', supplier_product_id?} | null
--   }]
-- }
CREATE OR REPLACE FUNCTION public.apply_stock_list_import(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rid uuid := public.get_user_restaurant_id();
  v_date date; s jsonb; r jsonb; it jsonb; pr jsonb; sp jsonb;
  sup_refs jsonb := '{}'; item_refs jsonb := '{}';
  v_sup uuid; v_ing uuid; v_sp uuid; v_row int; ex record; last record;
  v_code text; v_size numeric; v_unit text; v_cost numeric; v_base numeric; v_name text;
  n_sup int := 0; n_new int := 0; n_match int := 0; n_skip int := 0; n_price int := 0;
  n_sp_new int := 0; n_sp_link int := 0; n_spp int := 0; n_spp_same int := 0;
BEGIN
  IF rid IS NULL OR NOT public.can_edit_inventory() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF jsonb_typeof(p_payload->'rows') <> 'array' OR jsonb_array_length(p_payload->'rows') > 2000 THEN
    RAISE EXCEPTION 'rows must be an array of at most 2000'; END IF;
  IF coalesce(p_payload->>'effective_date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'effective_date must be YYYY-MM-DD'; END IF;
  v_date := (p_payload->>'effective_date')::date;
  IF v_date > current_date THEN RAISE EXCEPTION 'effective_date cannot be in the future'; END IF;

  -- New suppliers
  FOR s IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'suppliers','[]')) LOOP
    v_name := btrim(regexp_replace(coalesce(s->>'name',''), '\s+', ' ', 'g'));
    IF v_name = '' OR length(v_name) > 200 OR coalesce(s->>'ref','') = '' THEN
      RAISE EXCEPTION 'Invalid new supplier'; END IF;
    INSERT INTO suppliers (name, restaurant_id) VALUES (v_name, rid) RETURNING id INTO v_sup;
    sup_refs := sup_refs || jsonb_build_object(s->>'ref', v_sup); n_sup := n_sup + 1;
  END LOOP;

  FOR r IN SELECT * FROM jsonb_array_elements(p_payload->'rows') LOOP
    v_row := coalesce((public.jnum(r,'row'))::int, 0);
    BEGIN  -- per-row block only to label errors; any error still aborts the whole import
      IF coalesce((r->>'skip')::boolean, false) THEN n_skip := n_skip + 1; CONTINUE; END IF;

      -- Supplier
      v_sup := NULL;
      IF r->'supplier' ? 'id' THEN
        v_sup := public.juuid(r->'supplier','id');
        IF NOT EXISTS (SELECT 1 FROM suppliers WHERE id = v_sup AND restaurant_id = rid) THEN
          RAISE EXCEPTION 'supplier not in this restaurant'; END IF;
      ELSIF r->'supplier' ? 'ref' THEN
        v_sup := (sup_refs->>(r->'supplier'->>'ref'))::uuid;
        IF v_sup IS NULL THEN RAISE EXCEPTION 'unknown supplier reference'; END IF;
      END IF;

      -- Master item
      it := r->'item';
      IF it ? 'follow_ref' THEN
        v_ing := (item_refs->>(it->>'follow_ref'))::uuid;
        IF v_ing IS NULL THEN RAISE EXCEPTION 'duplicate row refers to an item not yet created'; END IF;
        n_match := n_match + 1;
      ELSIF it ? 'id' THEN
        v_ing := public.juuid(it,'id');
        SELECT * INTO ex FROM ingredients WHERE id = v_ing AND restaurant_id = rid;
        IF ex.id IS NULL THEN RAISE EXCEPTION 'inventory item not in this restaurant'; END IF;
        UPDATE ingredients SET
          supplier_id = coalesce(supplier_id, v_sup),
          category    = coalesce(category, nullif(it->>'category','')),
          item_group  = coalesce(item_group, nullif(it->>'item_group',''))
        WHERE id = v_ing AND (supplier_id IS NULL AND v_sup IS NOT NULL
           OR category IS NULL AND nullif(it->>'category','') IS NOT NULL
           OR item_group IS NULL AND nullif(it->>'item_group','') IS NOT NULL);
        n_match := n_match + 1;
      ELSIF it ? 'ref' THEN
        v_name := btrim(regexp_replace(coalesce(it->>'name',''), '\s+', ' ', 'g'));
        IF v_name = '' OR length(v_name) > 200 THEN RAISE EXCEPTION 'invalid item name'; END IF;
        IF public.normalize_unit(it->>'unit') IS NULL THEN RAISE EXCEPTION 'unknown unit'; END IF;
        IF coalesce(it->>'item_type','recipe_ingredient') NOT IN ('recipe_ingredient','direct_sale','operational') THEN
          RAISE EXCEPTION 'invalid item type'; END IF;
        INSERT INTO ingredients (name, restaurant_id, unit, storage_type, item_type, item_group,
          category, supplier_id, purchase_unit, pack_size, pack_unit, cost_per_pack, default_cost_price)
        VALUES (v_name, rid, (it->>'unit')::unit_type, (it->>'storage_type')::storage_type,
          coalesce(it->>'item_type','recipe_ingredient'), nullif(it->>'item_group',''),
          nullif(it->>'category',''), v_sup, nullif(it->>'purchase_unit',''),
          public.jnum(it,'pack_size'), nullif(it->>'pack_unit',''), NULL, NULL)
        RETURNING id INTO v_ing;
        item_refs := item_refs || jsonb_build_object(it->>'ref', v_ing); n_new := n_new + 1;
      ELSE
        RAISE EXCEPTION 'row has no item';
      END IF;

      -- Master starting price: reuse existing function unchanged; only for items with no price history
      pr := r->'price';
      IF pr IS NOT NULL AND jsonb_typeof(pr) = 'object'
         AND NOT EXISTS (SELECT 1 FROM ingredient_prices WHERE ingredient_id = v_ing) THEN
        v_cost := public.jnum(pr,'cost_per_pack'); v_size := public.jnum(pr,'pack_size');
        IF public.supplier_cost_per_base(v_cost, v_size, pr->>'pack_unit') IS NULL THEN
          RAISE EXCEPTION 'invalid price, pack size or unit'; END IF;
        PERFORM public.set_initial_import_price(v_ing, v_cost, v_size, pr->>'pack_unit', NULL);
        n_price := n_price + 1;
      END IF;

      -- Supplier product
      sp := r->'supplier_product';
      IF sp IS NOT NULL AND jsonb_typeof(sp) = 'object' THEN
        IF v_sup IS NULL THEN RAISE EXCEPTION 'supplier product needs a supplier'; END IF;
        v_name := btrim(coalesce(sp->>'product_name',''));
        IF v_name = '' OR length(v_name) > 300 THEN RAISE EXCEPTION 'invalid supplier description'; END IF;
        v_code := nullif(btrim(sp->>'product_code'),'');
        IF length(v_code) > 100 THEN RAISE EXCEPTION 'product code too long'; END IF;
        v_size := public.jnum(sp,'pack_size'); v_unit := nullif(btrim(sp->>'pack_unit'),'');
        IF v_unit IS NOT NULL AND public.normalize_unit(v_unit) IS NULL THEN RAISE EXCEPTION 'unknown pack unit'; END IF;

        IF sp->>'resolution' = 'link_existing' THEN
          v_sp := public.juuid(sp,'supplier_product_id');
          SELECT * INTO ex FROM supplier_products WHERE id = v_sp AND restaurant_id = rid
            AND supplier_id = v_sup AND archived_at IS NULL;
          IF ex.id IS NULL THEN RAISE EXCEPTION 'supplier product to link not found'; END IF;
          IF ex.ingredient_id <> v_ing THEN RAISE EXCEPTION 'supplier product belongs to another inventory item'; END IF;
          IF ex.pack_size IS DISTINCT FROM v_size OR lower(ex.pack_unit) IS DISTINCT FROM lower(v_unit) THEN
            RAISE EXCEPTION 'pack differs from existing supplier product'; END IF;
          n_sp_link := n_sp_link + 1;  -- existing code/description kept, never overwritten
        ELSIF coalesce(sp->>'resolution','new') = 'new' THEN
          -- Refuse silently-matching cases: any existing code or description match must have been reviewed
          IF EXISTS (SELECT 1 FROM supplier_products WHERE restaurant_id = rid AND supplier_id = v_sup
                       AND archived_at IS NULL
                       AND ((v_code IS NOT NULL AND lower(product_code) = lower(v_code))
                         OR normalized_name = public.supplier_name_key(v_name))) THEN
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

        -- Supplier price: append only if changed from the latest one
        IF pr IS NOT NULL AND jsonb_typeof(pr) = 'object' THEN
          v_cost := public.jnum(pr,'cost_per_pack'); v_size := public.jnum(pr,'pack_size');
          v_unit := pr->>'pack_unit';
          v_base := public.supplier_cost_per_base(v_cost, v_size, v_unit);
          IF v_base IS NULL THEN RAISE EXCEPTION 'invalid supplier price'; END IF;
          SELECT * INTO last FROM supplier_product_prices WHERE supplier_product_id = v_sp
            ORDER BY effective_date DESC, created_at DESC LIMIT 1;
          IF last.id IS NOT NULL AND last.cost_per_pack = v_cost AND last.pack_size = v_size
             AND lower(last.pack_unit) = lower(v_unit) THEN
            n_spp_same := n_spp_same + 1;
          ELSE
            INSERT INTO supplier_product_prices (restaurant_id, supplier_product_id, effective_date,
              cost_per_pack, pack_size, pack_unit, base_unit, cost_per_base_unit, source, created_by)
            VALUES (rid, v_sp, v_date, v_cost, v_size, v_unit, public.normalize_unit(v_unit),
              v_base, 'initial_import', auth.uid());
            n_spp := n_spp + 1;
          END IF;
          last := NULL;
        END IF;
      END IF;
      ex := NULL;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Row %: %', v_row, SQLERRM;  -- re-raise => entire import rolls back
    END;
  END LOOP;

  PERFORM public.log_audit_event(rid, 'stock_list_import', 'Stock list imported',
    jsonb_build_object('suppliers_created', n_sup, 'items_created', n_new, 'items_matched', n_match,
      'rows_skipped', n_skip, 'starting_prices', n_price, 'supplier_products_created', n_sp_new,
      'supplier_products_linked', n_sp_link, 'supplier_prices_added', n_spp,
      'supplier_prices_unchanged', n_spp_same));
  RETURN jsonb_build_object('suppliers_created', n_sup, 'items_created', n_new, 'items_matched', n_match,
    'rows_skipped', n_skip, 'starting_prices', n_price, 'supplier_products_created', n_sp_new,
    'supplier_products_linked', n_sp_link, 'supplier_prices_added', n_spp,
    'supplier_prices_unchanged', n_spp_same);
END $$;

-- ========== 6. Corrections and archive ==========
CREATE OR REPLACE FUNCTION public.correct_supplier_product_price(
  p_price_id uuid, p_cost_per_pack numeric, p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; nid uuid; v_base numeric;
BEGIN
  IF NOT public.can_edit_inventory() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO o FROM supplier_product_prices
   WHERE id = p_price_id AND restaurant_id = public.get_user_restaurant_id();
  IF o.id IS NULL THEN RAISE EXCEPTION 'Price not found'; END IF;
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

-- ========== 7. Existing delete/archive dependency check (full replacement) ==========
-- Only change: adds 'supplier_products' and requires it to be 0 for permanent delete.
-- delete_or_archive_ingredient is unchanged; it already archives whenever can_delete is false.
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

-- ========== 8. Execution permissions ==========
REVOKE ALL ON FUNCTION
  public.guard_supplier_product(), public.guard_supplier_product_price(),
  public.can_edit_inventory(), public.supplier_cost_per_base(numeric, numeric, text),
  public.preview_supplier_products(jsonb), public.apply_stock_list_import(jsonb),
  public.correct_supplier_product_price(uuid, numeric, text),
  public.set_supplier_product_archived(uuid, boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.can_edit_inventory(), public.supplier_cost_per_base(numeric, numeric, text),
  public.preview_supplier_products(jsonb), public.apply_stock_list_import(jsonb),
  public.correct_supplier_product_price(uuid, numeric, text),
  public.set_supplier_product_archived(uuid, boolean)
TO authenticated;
-- Trigger functions are not callable directly by anyone.
```

## Implementation plan (after approval)

- **Import review screen:** calls `preview_supplier_products` and shows each row's status. Conflict rows show the existing and imported code, description and pack side by side. You choose "Link to existing" (only offered when the item and pack are the same) or "Skip". Confirm stays disabled until every conflict is resolved.
- **Confirm:** builds one payload and makes one `apply_stock_list_import` call, replacing today's separate saves. The summary shows the counts it returns. On failure, the screen shows the row number and reason and confirms that nothing was saved.
- **Inventory item detail:** a read-only list of supplier products and their price history, including corrections, with Archive/Restore and "Add correction" (note required).
- No other screens or calculations change.

## Checks after applying (inside rolled-back test transactions)

1. Fingerprints before and after for ingredients, ingredient prices, recipes, stock, suppliers, purchase orders, documents, sales and POS mappings all match.
2. A 3-row import with the 3rd row malformed (a bad unit, text in a number field, an item ID from another restaurant) leaves 0 new items, suppliers, links or prices.
3. Re-importing on a later date adds 0 links and 0 prices. Changing one price adds exactly 1 price row.
4. Code-differs, description-differs, pack-differs and linked-to-another-item rows are flagged by the preview and rejected by the import unless resolved. Linking to an existing product never changes its code or item.
5. A correction of €12 per 5 kg saves €0.0024 per g. A second correction of the same original row is rejected. Edits and deletes are rejected for Owner.
6. Deleting a linked supplier, item, document or purchase order is blocked, or the item is archived. A document or purchase order from another restaurant, or a purchase order from another supplier, is rejected.
7. A non-member, or a member without Inventory Edit, is rejected by every function. Signed-out callers can't run them at all.
