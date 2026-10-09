# Revised migration: supplier products and supplier price history (not applied)

Nothing will be applied until you approve. Your existing ingredient costs, recipes, stock, POS mappings, purchase orders, sales and reports are not touched.

## What changed from the previous version

| Your point | How the revised SQL handles it |
|---|---|
| Append-only price history | App users, including Owners, can only **read** supplier prices. New prices are added only through checked functions. A trigger blocks every edit and delete. A correction adds a new row that points to the row it replaces. |
| Re-import on another date | The import function skips the price when it matches the latest price for that supplier product (same pack cost, pack size and unit). A changed price adds a new dated row. |
| Product-code and description conflicts | The linked ingredient and pack details **cannot be changed** after a product is created. If a code or description is already linked to a different ingredient or pack, the import stops that row with a clear conflict message. Remapping means archiving the old product and creating a new one. |
| Accidental deletion | All new links use RESTRICT, never CASCADE. Supplier products are archived, not deleted. Deleting an inventory item that has supplier products archives the item instead. |
| Document and purchase order ownership | A trigger checks that the linked document and purchase order belong to the same restaurant. It also checks that the purchase order's supplier matches. |
| All-or-nothing saves | One function saves all mappings and prices from an import confirmation in a single transaction. If any row fails, none of them are saved. |

## Trade-offs you can't avoid

1. **New inventory items are created first.** The importer creates new master items through the existing path before saving supplier links. If the supplier-link step then fails, those new items stay, but with no supplier links or supplier prices. Re-running the import matches and reuses them, so no duplicates are created. To make it fully all-or-nothing, item creation would have to move into the new function. That duplicates logic, so I left it out unless you want it.
2. **Suppliers that have supplier products can't be deleted.** The suppliers table has no archive option, and I'm not adding one in this change. Deleting such a supplier fails with a clear message.
3. **One existing function is changed:** the inventory-item delete/archive function now also counts supplier products as "in use". Its other behaviour stays the same.
4. **Matching by description is exact after cleanup.** "Same description" means the same text after trimming spaces and ignoring capitals and punctuation. Fuzzy matches are only suggested in the review screen and are never saved automatically.
5. **Unknown price stays unknown.** A supplier product can exist without any price row. Unknown is never stored as €0.

## Revised SQL

```sql
-- ===== 1. supplier_products =====
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

-- Duplicate protection (active rows only; archived history kept)
CREATE UNIQUE INDEX supplier_products_code_uq
  ON public.supplier_products (restaurant_id, supplier_id, lower(btrim(product_code)))
  WHERE product_code IS NOT NULL AND btrim(product_code) <> '' AND archived_at IS NULL;
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
-- No insert/update/delete policies: writes only via security-definer functions below.

-- ===== 2. supplier_product_prices (append-only) =====
CREATE TABLE public.supplier_product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  supplier_product_id uuid NOT NULL REFERENCES public.supplier_products(id) ON DELETE RESTRICT,
  effective_date date NOT NULL,
  cost_per_pack numeric NOT NULL CHECK (cost_per_pack > 0),
  pack_size numeric NOT NULL CHECK (pack_size > 0),
  pack_unit text NOT NULL,
  cost_per_base_unit numeric,
  source text NOT NULL CHECK (source IN ('initial_import','invoice','purchase_order','manual','correction')),
  document_id uuid REFERENCES public.documents(id) ON DELETE RESTRICT,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  supersedes_id uuid REFERENCES public.supplier_product_prices(id) ON DELETE RESTRICT,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX spp_product_date_idx ON public.supplier_product_prices (supplier_product_id, effective_date DESC, created_at DESC);
-- Same invoice can't record the same product twice (corrections use supersedes_id)
CREATE UNIQUE INDEX spp_document_uq ON public.supplier_product_prices (supplier_product_id, document_id)
  WHERE document_id IS NOT NULL AND supersedes_id IS NULL;
-- A row can be superseded only once
CREATE UNIQUE INDEX spp_supersedes_uq ON public.supplier_product_prices (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

GRANT SELECT ON public.supplier_product_prices TO authenticated;
GRANT ALL ON public.supplier_product_prices TO service_role;
ALTER TABLE public.supplier_product_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read supplier prices" ON public.supplier_product_prices
  FOR SELECT TO authenticated USING (public.user_belongs_to_restaurant(restaurant_id));

-- ===== 3. Integrity triggers =====
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
    RAISE EXCEPTION 'Ingredient does not belong to this restaurant';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.restaurant_id <> OLD.restaurant_id OR NEW.supplier_id <> OLD.supplier_id
       OR NEW.ingredient_id <> OLD.ingredient_id
       OR NEW.pack_size IS DISTINCT FROM OLD.pack_size
       OR NEW.pack_unit IS DISTINCT FROM OLD.pack_unit THEN
      RAISE EXCEPTION 'Supplier, ingredient and pack cannot change; archive and create a new supplier product';
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_supplier_product
  BEFORE INSERT OR UPDATE OR DELETE ON public.supplier_products
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_product();

CREATE OR REPLACE FUNCTION public.guard_supplier_product_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sp record;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    RAISE EXCEPTION 'Supplier price history is append-only; add a correction instead';
  END IF;
  SELECT * INTO sp FROM supplier_products WHERE id = NEW.supplier_product_id;
  IF sp.restaurant_id IS DISTINCT FROM NEW.restaurant_id THEN
    RAISE EXCEPTION 'Supplier product belongs to a different restaurant';
  END IF;
  IF NEW.document_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM documents WHERE id = NEW.document_id AND restaurant_id = NEW.restaurant_id) THEN
    RAISE EXCEPTION 'Document belongs to a different restaurant';
  END IF;
  IF NEW.purchase_order_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM purchase_orders WHERE id = NEW.purchase_order_id
        AND restaurant_id = NEW.restaurant_id AND supplier_id = sp.supplier_id) THEN
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

-- ===== 4. Permission helper (same rule as set_initial_import_price) =====
CREATE OR REPLACE FUNCTION public.can_edit_inventory()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.user_is_owner()
      OR public.user_has_permission('inventory','edit')
      OR public.user_has_permission('inventory','admin');
$$;
-- (At apply time the resource/action names are copied exactly from set_initial_import_price.)

-- ===== 5. Atomic import of supplier mappings + prices =====
-- p_rows: [{supplier_id, ingredient_id, product_name, product_code, pack_size,
--           pack_unit, purchase_unit, cost_per_pack, cost_per_base_unit}]
CREATE OR REPLACE FUNCTION public.import_supplier_products(p_rows jsonb, p_effective_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rid uuid := public.get_user_restaurant_id();
  r jsonb; sp_id uuid; ex record; last record;
  v_norm text; v_code text;
  created int := 0; reused int := 0; priced int := 0; unchanged int := 0;
BEGIN
  IF rid IS NULL OR NOT public.can_edit_inventory() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_norm := btrim(regexp_replace(lower(r->>'product_name'), '[^a-z0-9]+', ' ', 'g'));
    v_code := nullif(btrim(r->>'product_code'), '');
    sp_id := NULL;

    -- Code match first, then description + pack
    IF v_code IS NOT NULL THEN
      SELECT * INTO ex FROM supplier_products
       WHERE restaurant_id = rid AND supplier_id = (r->>'supplier_id')::uuid
         AND lower(product_code) = lower(v_code) AND archived_at IS NULL;
    END IF;
    IF ex.id IS NULL THEN
      SELECT * INTO ex FROM supplier_products
       WHERE restaurant_id = rid AND supplier_id = (r->>'supplier_id')::uuid
         AND normalized_name = v_norm
         AND coalesce(pack_size,-1) = coalesce((r->>'pack_size')::numeric,-1)
         AND coalesce(lower(pack_unit),'') = coalesce(lower(r->>'pack_unit'),'')
         AND archived_at IS NULL;
    END IF;

    IF ex.id IS NOT NULL THEN
      IF ex.ingredient_id <> (r->>'ingredient_id')::uuid THEN
        RAISE EXCEPTION 'Conflict: "%" is already linked to a different inventory item', r->>'product_name';
      END IF;
      IF ex.pack_size IS DISTINCT FROM (r->>'pack_size')::numeric
         OR lower(ex.pack_unit) IS DISTINCT FROM lower(r->>'pack_unit') THEN
        RAISE EXCEPTION 'Conflict: code % already used for a different pack size', v_code;
      END IF;
      sp_id := ex.id; reused := reused + 1;
    ELSE
      INSERT INTO supplier_products (restaurant_id, supplier_id, ingredient_id, product_name,
        normalized_name, product_code, pack_size, pack_unit, purchase_unit, created_by)
      VALUES (rid, (r->>'supplier_id')::uuid, (r->>'ingredient_id')::uuid, btrim(r->>'product_name'),
        v_norm, v_code, (r->>'pack_size')::numeric, r->>'pack_unit', r->>'purchase_unit', auth.uid())
      RETURNING id INTO sp_id;
      created := created + 1;
    END IF;

    -- Price: only when known, and only if different from the latest price
    IF (r->>'cost_per_pack') IS NOT NULL THEN
      SELECT * INTO last FROM supplier_product_prices
       WHERE supplier_product_id = sp_id
       ORDER BY effective_date DESC, created_at DESC LIMIT 1;
      IF last.id IS NOT NULL
         AND last.cost_per_pack = (r->>'cost_per_pack')::numeric
         AND last.pack_size = (r->>'pack_size')::numeric
         AND lower(last.pack_unit) = lower(r->>'pack_unit') THEN
        unchanged := unchanged + 1;
      ELSE
        INSERT INTO supplier_product_prices (restaurant_id, supplier_product_id, effective_date,
          cost_per_pack, pack_size, pack_unit, cost_per_base_unit, source, created_by)
        VALUES (rid, sp_id, p_effective_date, (r->>'cost_per_pack')::numeric,
          (r->>'pack_size')::numeric, r->>'pack_unit', (r->>'cost_per_base_unit')::numeric,
          'initial_import', auth.uid());
        priced := priced + 1;
      END IF;
    END IF;
    ex := NULL; last := NULL;
  END LOOP;
  RETURN jsonb_build_object('created', created, 'reused', reused,
                            'prices_added', priced, 'prices_unchanged', unchanged);
END $$;
-- Any RAISE rolls back the whole call: no partial mappings or prices.

-- ===== 6. Corrections (append-only) and archive/restore =====
CREATE OR REPLACE FUNCTION public.correct_supplier_product_price(
  p_price_id uuid, p_cost_per_pack numeric, p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; nid uuid;
BEGIN
  SELECT * INTO o FROM supplier_product_prices WHERE id = p_price_id;
  IF o.id IS NULL OR o.restaurant_id <> public.get_user_restaurant_id() OR NOT public.can_edit_inventory() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF coalesce(btrim(p_note),'') = '' THEN RAISE EXCEPTION 'A correction note is required'; END IF;
  INSERT INTO supplier_product_prices (restaurant_id, supplier_product_id, effective_date, cost_per_pack,
    pack_size, pack_unit, cost_per_base_unit, source, document_id, purchase_order_id, supersedes_id, note, created_by)
  VALUES (o.restaurant_id, o.supplier_product_id, o.effective_date, p_cost_per_pack, o.pack_size, o.pack_unit,
    NULL, 'correction', o.document_id, o.purchase_order_id, o.id, p_note, auth.uid())
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
  -- Restore fails on the unique indexes if an active duplicate now exists.
END $$;

REVOKE ALL ON FUNCTION public.import_supplier_products(jsonb, date),
  public.correct_supplier_product_price(uuid, numeric, text),
  public.set_supplier_product_archived(uuid, boolean),
  public.can_edit_inventory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_supplier_products(jsonb, date),
  public.correct_supplier_product_price(uuid, numeric, text),
  public.set_supplier_product_archived(uuid, boolean),
  public.can_edit_inventory() TO authenticated;

-- ===== 7. Existing delete/archive item check =====
-- delete_or_archive_ingredient / ingredient_dependencies: add
--   "supplier products" count; any count > 0 => archive, never delete.
-- (Existing body copied unchanged apart from this one extra dependency.)
```

## Frontend plan (after approval)

- **Stock List Importer:** after you confirm, existing items are matched or new items created as today. Then one call to `import_supplier_products` saves every supplier link and price together. The summary shows links created and reused, prices added, and prices unchanged. Any conflict stops the save and names the row.
- **Review screen:** a new "Supplier product" column shows New, Already linked, or Conflict before anything is written.
- **Inventory item detail:** a read-only list of the item's supplier products and each one's price history, with Archive/Restore and "Add correction" controls.
- The item's normal supplier, starting price, master costing, recipes, stock quantities and reports are unchanged. Supplier prices are stored separately and do not feed dish costing.

## Checks to run after applying (inside rolled-back test transactions)

1. Fingerprints before and after for ingredients, ingredient prices, recipes, stock, suppliers, purchase orders, documents and sales all match.
2. Importing the same list twice on different dates adds 0 new links and 0 new prices. Changing one price adds exactly 1 price row.
3. A code or description already linked to another item, or a different pack under the same code, is rejected, and nothing from that batch is saved.
4. Edits and deletes of supplier prices fail for the Owner account. A correction adds a new row.
5. Deleting a supplier, an inventory item, a document or a purchase order that is linked is blocked or archived. No history is lost.
6. A supplier, item, document or purchase order from another restaurant is rejected. Another restaurant can't read these rows.
7. A user without Inventory Edit/Admin permission is rejected.
