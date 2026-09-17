-- 0. Re-runnability: lift history immutability for the duration of this migration
DROP TRIGGER IF EXISTS trg_ingredient_prices_immutable ON public.ingredient_prices;

DROP TABLE IF EXISTS public.zz_cost_test;

-- 1. Effective dating + normalised cost on the EXISTING history table
ALTER TABLE public.ingredient_prices
  ADD COLUMN IF NOT EXISTS effective_date      date,
  ADD COLUMN IF NOT EXISTS cost_per_base_unit  numeric,
  ADD COLUMN IF NOT EXISTS base_unit           text,
  ADD COLUMN IF NOT EXISTS pack_size           numeric,
  ADD COLUMN IF NOT EXISTS pack_unit           text,
  ADD COLUMN IF NOT EXISTS cost_per_pack       numeric,
  ADD COLUMN IF NOT EXISTS source              text,
  ADD COLUMN IF NOT EXISTS revision            integer,
  ADD COLUMN IF NOT EXISTS note                text,
  ADD COLUMN IF NOT EXISTS created_by          uuid;

UPDATE public.ingredient_prices SET effective_date = created_at::date WHERE effective_date IS NULL;
UPDATE public.ingredient_prices SET source = 'legacy' WHERE source IS NULL;
UPDATE public.ingredient_prices SET revision = 0 WHERE revision IS NULL;

ALTER TABLE public.ingredient_prices
  ALTER COLUMN effective_date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN effective_date SET NOT NULL,
  ALTER COLUMN source SET DEFAULT 'manual',
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN revision SET DEFAULT 0,
  ALTER COLUMN revision SET NOT NULL;

ALTER TABLE public.ingredient_prices DROP CONSTRAINT IF EXISTS ingredient_prices_source_chk;
ALTER TABLE public.ingredient_prices ADD CONSTRAINT ingredient_prices_source_chk
  CHECK (source IN ('seed_current','legacy','manual','purchase','backdated'));

ALTER TABLE public.ingredient_prices DROP CONSTRAINT IF EXISTS ingredient_prices_base_cost_chk;
ALTER TABLE public.ingredient_prices ADD CONSTRAINT ingredient_prices_base_cost_chk
  CHECK (cost_per_base_unit IS NULL OR cost_per_base_unit >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ingredient_prices_effective_revision
  ON public.ingredient_prices (ingredient_id, effective_date, revision);

CREATE INDEX IF NOT EXISTS idx_ingredient_prices_lookup
  ON public.ingredient_prices (ingredient_id, effective_date DESC, revision DESC, created_at DESC);

-- 2. Backfill normalised cost on pre-existing (legacy) rows. NULL stays NULL.
UPDATE public.ingredient_prices p
   SET cost_per_base_unit = CASE
         WHEN p.cost_price IS NULL OR p.cost_price <= 0 THEN NULL
         ELSE p.cost_price / NULLIF(public.unit_factor(i.unit::text), 0) END,
       base_unit = public.get_ingredient_cost_unit(i.id)
  FROM public.ingredients i
 WHERE i.id = p.ingredient_id AND p.cost_per_base_unit IS NULL;

-- 3. Freeze today's effective cost as the open-ended baseline
INSERT INTO public.ingredient_prices
  (ingredient_id, restaurant_id, cost_price, effective_date, revision,
   cost_per_base_unit, base_unit, pack_size, pack_unit, cost_per_pack, source)
SELECT i.id, i.restaurant_id, COALESCE(i.default_cost_price, 0), DATE '1900-01-01', 0,
       NULLIF(public.get_ingredient_base_cost(i.id), 0),
       public.get_ingredient_cost_unit(i.id),
       i.pack_size, i.pack_unit, i.cost_per_pack, 'seed_current'
  FROM public.ingredients i
 WHERE NOT EXISTS (SELECT 1 FROM public.ingredient_prices p
                    WHERE p.ingredient_id = i.id AND p.source = 'seed_current');

-- 4. Restore immutability LAST
DROP TRIGGER IF EXISTS trg_ingredient_prices_immutable ON public.ingredient_prices;
CREATE TRIGGER trg_ingredient_prices_immutable
BEFORE UPDATE OR DELETE ON public.ingredient_prices
FOR EACH ROW EXECUTE FUNCTION public.protect_ingredient_price_history();