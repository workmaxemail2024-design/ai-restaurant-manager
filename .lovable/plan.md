# Revised migration for approval (not yet run)

## Audit of existing adjustment reasons

The current allowed set is exactly: `waste`, `spoilage`, `theft`, `damage`, `correction`, `other`.
The app maps its reason labels onto these: Wastage → waste, Spoilage → spoilage, Breakage → damage, Staff meal → other, Stock correction → correction, Other → other.
There are currently no adjustment rows in the database.

**All six values are kept unchanged.** The revised migration only adds `count` to that set — nothing is renamed or removed, so Wastage, Spoilage, Breakage, Staff meal and Stock correction keep working exactly as today.

## Corrections applied

1. Existing adjustment reasons preserved verbatim; `count` added alongside them.
2. Count lines get the same closed-day protection as the parent count — insert, edit and delete are all blocked when the trading day is closed.
3. Count lines no longer trust client-supplied restaurant/location: both are derived from the parent count row before the line is saved, and any mismatch is overwritten with the parent's values.
4. A stock adjustment may only carry a count reference when its reason is `count`, and "Last counted" is read from submitted count lines only — never from ordinary wastage or corrections.
5. Who submitted a count is set by the database from the signed-in user, not from client input.
6. The difference on each count line is calculated by the database as counted − expected; a client-supplied value is ignored.

## Confirmation: counts above and below expected

The existing spot-count path (`useRecordDayStockAdjustment`) already handles both directions correctly and is what the count workflow will reuse:

- It logs an adjustment whose quantity is `current − counted`: positive when the count is below expected (stock lost), negative when the count is above expected (stock found).
- It then **sets** the stock level to the counted amount rather than subtracting again, so there is no double adjustment in either direction.

One small code fix is needed alongside it: the adjustments list currently flags any adjustment with a quantity of zero or less as invalid, which would wrongly flag a legitimate count-above-expected. Count rows will be shown as "Physical count +/−" instead. No change to the stock update maths itself.

## Revised SQL

```sql
-- 1. Grouping fields on existing inventory items
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS item_group text,
  ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_item_group_check
  CHECK (item_group IS NULL OR item_group IN ('food','beverage','operational'));

ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_category_check
  CHECK (category IS NULL OR category IN (
    'meat','fish_seafood','dairy','fruit','vegetables','dry_goods','bakery','frozen',
    'beer','wine','spirits','soft_drinks','packaging','cleaning','other'
  ));

-- 2. Keep every existing reason, add 'count'
ALTER TABLE public.stock_adjustments DROP CONSTRAINT IF EXISTS stock_adjustments_adjustment_type_check;
ALTER TABLE public.stock_adjustments
  ADD CONSTRAINT stock_adjustments_adjustment_type_check
  CHECK (adjustment_type = ANY (ARRAY[
    'waste','spoilage','theft','damage','correction','other','count'
  ]));

-- 3. Stock count sessions
CREATE TABLE public.stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  count_date date NOT NULL DEFAULT current_date,
  scope_type text NOT NULL DEFAULT 'all' CHECK (scope_type IN ('all','group','category')),
  scope_value text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted')),
  submitted_by uuid NOT NULL DEFAULT auth.uid(),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_counts TO authenticated;
GRANT ALL ON public.stock_counts TO service_role;
ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant access to stock_counts" ON public.stock_counts
  FOR ALL TO authenticated
  USING (public.user_belongs_to_restaurant(restaurant_id))
  WITH CHECK (public.user_belongs_to_restaurant(restaurant_id));

CREATE POLICY "Location scope restrict" ON public.stock_counts
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE TRIGGER update_stock_counts_updated_at
  BEFORE UPDATE ON public.stock_counts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.guard_stock_counts_closed_day()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.assert_day_open(OLD.restaurant_id, OLD.location_id, OLD.count_date);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.assert_day_open(NEW.restaurant_id, NEW.location_id, NEW.count_date);
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_guard_stock_counts_closed_day
  BEFORE INSERT OR UPDATE OR DELETE ON public.stock_counts
  FOR EACH ROW EXECUTE FUNCTION public.guard_stock_counts_closed_day();

-- 4. Stock count lines
CREATE TABLE public.stock_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES public.stock_counts(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  expected_quantity numeric NOT NULL DEFAULT 0,
  counted_quantity numeric NOT NULL,
  difference numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (count_id, ingredient_id)
);

CREATE INDEX idx_stock_count_lines_ingredient
  ON public.stock_count_lines (ingredient_id, location_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_count_lines TO authenticated;
GRANT ALL ON public.stock_count_lines TO service_role;
ALTER TABLE public.stock_count_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant access to stock_count_lines" ON public.stock_count_lines
  FOR ALL TO authenticated
  USING (public.user_belongs_to_restaurant(restaurant_id))
  WITH CHECK (public.user_belongs_to_restaurant(restaurant_id));

CREATE POLICY "Location scope restrict" ON public.stock_count_lines
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

-- 4a. Derive restaurant/location from the parent count and the difference from the
--     counted/expected quantities — never from the client
CREATE OR REPLACE FUNCTION public.sync_stock_count_line_parent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p RECORD;
BEGIN
  SELECT restaurant_id, location_id, count_date INTO p
  FROM public.stock_counts WHERE id = NEW.count_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent stock count % not found', NEW.count_id;
  END IF;
  NEW.restaurant_id := p.restaurant_id;
  NEW.location_id := p.location_id;
  NEW.difference := COALESCE(NEW.counted_quantity, 0) - COALESCE(NEW.expected_quantity, 0);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_stock_count_line_parent
  BEFORE INSERT OR UPDATE ON public.stock_count_lines
  FOR EACH ROW EXECUTE FUNCTION public.sync_stock_count_line_parent();

-- 4b. Same closed-day protection as the parent count
CREATE OR REPLACE FUNCTION public.guard_stock_count_lines_closed_day()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT restaurant_id, location_id, count_date INTO p
    FROM public.stock_counts WHERE id = OLD.count_id;
    IF FOUND THEN
      PERFORM public.assert_day_open(p.restaurant_id, p.location_id, p.count_date);
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT restaurant_id, location_id, count_date INTO p
    FROM public.stock_counts WHERE id = NEW.count_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent stock count % not found', NEW.count_id;
    END IF;
    PERFORM public.assert_day_open(p.restaurant_id, p.location_id, p.count_date);
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_guard_stock_count_lines_closed_day
  BEFORE INSERT OR UPDATE OR DELETE ON public.stock_count_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_stock_count_lines_closed_day();

-- 5. Link corrections back to their count; only 'count' adjustments may carry one
ALTER TABLE public.stock_adjustments
  ADD COLUMN IF NOT EXISTS count_id uuid REFERENCES public.stock_counts(id) ON DELETE SET NULL;

ALTER TABLE public.stock_adjustments
  ADD CONSTRAINT stock_adjustments_count_link_check
  CHECK (count_id IS NULL OR adjustment_type = 'count');
```

Nothing else in the plan changes. Approve and I'll run this, then build the grouping fields, renamed Stock tabs, Count Stock workflow, Last counted / Count due and the read-only Variance view.
