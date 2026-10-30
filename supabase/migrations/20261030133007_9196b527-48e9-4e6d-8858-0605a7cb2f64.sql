-- 0. Align overheads checks with the categories/frequencies the app already offers (widening only)
ALTER TABLE public.overheads DROP CONSTRAINT IF EXISTS overheads_category_check;
ALTER TABLE public.overheads ADD CONSTRAINT overheads_category_check CHECK (category = ANY (ARRAY[
  'Rent','Utilities','Insurance','Marketing','Software','Licences','Waste','Internet',
  'Professional fees','Bank & card fees','Repairs & maintenance','Cleaning','Equipment','Other']));
ALTER TABLE public.overheads DROP CONSTRAINT IF EXISTS overheads_frequency_check;
ALTER TABLE public.overheads ADD CONSTRAINT overheads_frequency_check CHECK (frequency = ANY (ARRAY[
  'one_time','daily','weekly','monthly','quarterly','yearly']));

-- 1. Import history
CREATE TABLE public.expense_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.documents(id) ON DELETE RESTRICT,
  filename text NOT NULL CHECK (length(btrim(filename)) > 0),
  file_hash text,
  source_type text NOT NULL CHECK (source_type IN ('xlsx','csv','pdf','image','manual')),
  rows_estimate integer NOT NULL DEFAULT 0,
  rows_actual integer NOT NULL DEFAULT 0,
  rows_payroll integer NOT NULL DEFAULT 0,
  rows_skipped integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.expense_import_batches TO authenticated;
GRANT ALL ON public.expense_import_batches TO service_role;
ALTER TABLE public.expense_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance viewers read import history" ON public.expense_import_batches
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant(restaurant_id)
         AND (public.user_is_owner() OR public.user_has_permission('finance','view')));
CREATE INDEX expense_import_batches_hash_idx ON public.expense_import_batches (restaurant_id, file_hash);

-- 2. Overhead provenance (defaults leave existing rows unchanged)
ALTER TABLE public.overheads
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS cost_type text CHECK (cost_type IN ('fixed','variable')),
  ADD COLUMN IF NOT EXISTS vat_treatment text NOT NULL DEFAULT 'unknown' CHECK (vat_treatment IN ('unknown','inc_vat','ex_vat','no_vat')),
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS source_category text,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES public.expense_import_batches(id) ON DELETE RESTRICT;

-- 3. Actual expenses (append-only; void with reason)
CREATE TABLE public.actual_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  period_month date NOT NULL CHECK (extract(day FROM period_month) = 1),
  bill_date date,
  supplier_name text,
  supplier_key text NOT NULL DEFAULT '',
  invoice_reference text,
  source_ref text,
  description text NOT NULL CHECK (length(btrim(description)) > 0),
  category text NOT NULL CHECK (category = ANY (ARRAY[
    'Rent','Utilities','Insurance','Marketing','Software','Licences','Waste','Internet',
    'Professional fees','Bank & card fees','Repairs & maintenance','Cleaning','Equipment','Other'])),
  source_category text,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  vat_treatment text NOT NULL CHECK (vat_treatment IN ('unknown','inc_vat','ex_vat','no_vat')),
  vat_amount numeric(12,2) CHECK (vat_amount IS NULL OR vat_amount >= 0),
  cost_type text CHECK (cost_type IN ('fixed','variable')),
  replaces_overhead_id uuid REFERENCES public.overheads(id) ON DELETE SET NULL,
  import_batch_id uuid REFERENCES public.expense_import_batches(id) ON DELETE RESTRICT,
  document_id uuid REFERENCES public.documents(id) ON DELETE RESTRICT,
  notes text,
  dedupe_key text NOT NULL,
  duplicate_confirmed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','void')),
  void_reason text,
  voided_by uuid,
  voided_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.actual_expenses TO authenticated;
GRANT ALL ON public.actual_expenses TO service_role;
ALTER TABLE public.actual_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance and report viewers read actual expenses" ON public.actual_expenses
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant(restaurant_id)
         AND public.user_can_access_location(location_id)
         AND (public.user_is_owner() OR public.user_has_permission('finance','view')
              OR public.user_has_permission('reports','view') OR public.user_has_permission('settings','view')));
-- Hard duplicates: same supplier + same invoice number, or the same source row re-imported
CREATE UNIQUE INDEX actual_expenses_active_invoice_ref ON public.actual_expenses
  (restaurant_id, location_id, supplier_key, lower(btrim(invoice_reference)))
  WHERE status = 'active' AND invoice_reference IS NOT NULL;
CREATE UNIQUE INDEX actual_expenses_active_source_ref ON public.actual_expenses (restaurant_id, source_ref)
  WHERE status = 'active' AND source_ref IS NOT NULL;
-- Possible duplicates (same supplier/description/amount/month) are looked up, never unique
CREATE INDEX actual_expenses_dedupe_lookup ON public.actual_expenses (restaurant_id, location_id, period_month, dedupe_key) WHERE status = 'active';
CREATE INDEX actual_expenses_month_idx ON public.actual_expenses (restaurant_id, period_month);

-- 4. Confirmed monthly payroll (append-only; corrections supersede)
CREATE TABLE public.actual_payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  period_month date NOT NULL CHECK (extract(day FROM period_month) = 1),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  scope text NOT NULL CHECK (scope IN ('gross_wages','gross_wages_employer_prsi','total_employment_cost','other')),
  scope_note text,
  source text NOT NULL CHECK (source IN ('accountant_import','manual')),
  import_batch_id uuid REFERENCES public.expense_import_batches(id) ON DELETE RESTRICT,
  document_id uuid REFERENCES public.documents(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','void')),
  supersedes_id uuid REFERENCES public.actual_payroll(id) ON DELETE RESTRICT,
  change_reason text,
  ended_reason text,
  ended_by uuid,
  ended_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT actual_payroll_other_scope_note CHECK (scope <> 'other' OR length(btrim(coalesce(scope_note,''))) > 0),
  CONSTRAINT actual_payroll_correction_reason CHECK (supersedes_id IS NULL OR length(btrim(coalesce(change_reason,''))) > 0)
);
GRANT SELECT ON public.actual_payroll TO authenticated;
GRANT ALL ON public.actual_payroll TO service_role;
ALTER TABLE public.actual_payroll ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance and report viewers read confirmed payroll" ON public.actual_payroll
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant(restaurant_id)
         AND public.user_can_access_location(location_id)
         AND (public.user_is_owner() OR public.user_has_permission('finance','view')
              OR public.user_has_permission('reports','view')));
CREATE UNIQUE INDEX actual_payroll_one_active ON public.actual_payroll (location_id, period_month) WHERE status = 'active';
CREATE INDEX actual_payroll_month_idx ON public.actual_payroll (restaurant_id, period_month);

-- 5. Integrity triggers
CREATE OR REPLACE FUNCTION public.actual_finance_tenant_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.locations WHERE id = NEW.location_id AND restaurant_id = NEW.restaurant_id) THEN
    RAISE EXCEPTION 'Location does not belong to this restaurant' USING ERRCODE = '42501';
  END IF;
  IF NEW.document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.documents WHERE id = NEW.document_id AND restaurant_id = NEW.restaurant_id) THEN
    RAISE EXCEPTION 'Source document does not belong to this restaurant' USING ERRCODE = '42501';
  END IF;
  IF NEW.import_batch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.expense_import_batches WHERE id = NEW.import_batch_id AND restaurant_id = NEW.restaurant_id) THEN
    RAISE EXCEPTION 'Import does not belong to this restaurant' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'actual_expenses' THEN
    IF NEW.replaces_overhead_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.overheads WHERE id = NEW.replaces_overhead_id AND restaurant_id = NEW.restaurant_id AND location_id = NEW.location_id) THEN
      RAISE EXCEPTION 'The replaced estimate must belong to the same location' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER actual_expenses_tenant_check BEFORE INSERT ON public.actual_expenses
  FOR EACH ROW EXECUTE FUNCTION public.actual_finance_tenant_check();
CREATE TRIGGER actual_payroll_tenant_check BEFORE INSERT ON public.actual_payroll
  FOR EACH ROW EXECUTE FUNCTION public.actual_finance_tenant_check();

CREATE OR REPLACE FUNCTION public.actual_finance_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_allowed text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.is_trusted_backend_session() THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Recorded expenses and payroll are permanent; void or correct them with a reason instead' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'actual_expenses' THEN
    v_allowed := ARRAY['status','void_reason','voided_by','voided_at','updated_at','replaces_overhead_id'];
    IF NEW.replaces_overhead_id IS NOT NULL AND NEW.replaces_overhead_id IS DISTINCT FROM OLD.replaces_overhead_id THEN
      RAISE EXCEPTION 'The replaced estimate cannot be changed after saving' USING ERRCODE = '42501';
    END IF;
  ELSE
    v_allowed := ARRAY['status','ended_reason','ended_by','ended_at'];
  END IF;
  IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
    RAISE EXCEPTION 'Recorded amounts are permanent; void or correct them with a reason instead' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status <> 'active' THEN
    RAISE EXCEPTION 'Only a current record can be voided or corrected' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER actual_expenses_immutable BEFORE UPDATE OR DELETE ON public.actual_expenses
  FOR EACH ROW EXECUTE FUNCTION public.actual_finance_immutable();
CREATE TRIGGER actual_payroll_immutable BEFORE UPDATE OR DELETE ON public.actual_payroll
  FOR EACH ROW EXECUTE FUNCTION public.actual_finance_immutable();

-- 6. Helpers
CREATE OR REPLACE FUNCTION public.expense_finance_guard(p_restaurant_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_trusted_backend_session() THEN RETURN; END IF;
  IF auth.uid() IS NULL OR p_restaurant_id IS NULL OR NOT public.user_belongs_to_restaurant(p_restaurant_id)
     OR public.get_user_restaurant_id() IS DISTINCT FROM p_restaurant_id THEN
    RAISE EXCEPTION 'Not authorized for this restaurant' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.user_is_owner() OR public.user_has_permission('finance','edit')) THEN
    RAISE EXCEPTION 'Saving expenses and payroll needs Owner or Finance Edit permission' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.expense_location_guard(p_restaurant_id uuid, p_location_id uuid, p_label text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION '%Choose a location', p_label USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.locations WHERE id = p_location_id AND restaurant_id = p_restaurant_id) THEN
    RAISE EXCEPTION '%That location does not belong to this restaurant', p_label USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_can_access_location(p_location_id) THEN
    RAISE EXCEPTION '%You do not have access to that location', p_label USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.expense_supplier_key(p_supplier text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT btrim(regexp_replace(regexp_replace(lower(coalesce(p_supplier,'')), '\m(ltd|limited|plc|inc|co|company|the)\M', ' ', 'g'), '[^a-z0-9]+', '', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.expense_dedupe_key(p_supplier text, p_description text, p_amount numeric)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT public.expense_supplier_key(p_supplier) || '|' || regexp_replace(lower(coalesce(p_description,'')), '[^a-z0-9]+', '', 'g')
         || '|' || round(p_amount, 2)::text
$$;

CREATE OR REPLACE FUNCTION public.expense_jdate(p_v text, p_label text, p_field text)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF p_v IS NULL OR btrim(p_v) = '' THEN RETURN NULL; END IF;
  IF p_v !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION '%', p_label || p_field || ' is not a valid date' USING ERRCODE = '22023';
  END IF;
  RETURN p_v::date;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
  RAISE EXCEPTION '%', p_label || p_field || ' is not a valid date' USING ERRCODE = '22023';
END $$;

CREATE OR REPLACE FUNCTION public.expense_jamount(p_v text, p_label text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF p_v IS NULL OR p_v !~ '^\d+(\.\d+)?$' OR p_v::numeric <= 0 THEN
    RAISE EXCEPTION '%Enter an amount above zero', p_label USING ERRCODE = '22023';
  END IF;
  RETURN round(p_v::numeric, 2);
END $$;

-- 7. Payroll core (internal)
CREATE OR REPLACE FUNCTION public._insert_actual_payroll(
  p_restaurant_id uuid, p_location_id uuid, p_period_month date, p_amount numeric,
  p_scope text, p_scope_note text, p_source text, p_batch_id uuid, p_document_id uuid,
  p_replace_id uuid, p_reason text, p_label text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing uuid;
  v_id uuid;
BEGIN
  IF p_period_month IS NULL THEN
    RAISE EXCEPTION '%Choose the accounting month for this payroll', p_label USING ERRCODE = '22023';
  END IF;
  IF p_period_month <> date_trunc('month', p_period_month)::date THEN
    RAISE EXCEPTION '%The accounting month must start on the 1st', p_label USING ERRCODE = '22023';
  END IF;
  IF p_period_month > date_trunc('month', current_date)::date THEN
    RAISE EXCEPTION '%Payroll cannot be confirmed for a future month', p_label USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '%Enter a payroll total above zero', p_label USING ERRCODE = '22023';
  END IF;
  IF p_scope IS NULL OR p_scope NOT IN ('gross_wages','gross_wages_employer_prsi','total_employment_cost','other') THEN
    RAISE EXCEPTION '%Choose what the payroll total includes', p_label USING ERRCODE = '22023';
  END IF;
  IF p_scope = 'other' AND length(btrim(coalesce(p_scope_note,''))) = 0 THEN
    RAISE EXCEPTION '%Describe what the payroll total includes', p_label USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_existing FROM public.actual_payroll
   WHERE location_id = p_location_id AND period_month = p_period_month AND status = 'active'
   FOR UPDATE;

  IF v_existing IS NOT NULL THEN
    IF p_replace_id IS DISTINCT FROM v_existing THEN
      RAISE EXCEPTION '%This location already has confirmed payroll for %; choose Correct and give a reason',
        p_label, to_char(p_period_month, 'FMMonth YYYY') USING ERRCODE = '23505';
    END IF;
    IF length(btrim(coalesce(p_reason,''))) = 0 THEN
      RAISE EXCEPTION '%Give a reason for correcting the confirmed payroll', p_label USING ERRCODE = '22023';
    END IF;
    UPDATE public.actual_payroll
       SET status = 'superseded', ended_reason = btrim(p_reason), ended_by = auth.uid(), ended_at = now()
     WHERE id = v_existing;
  ELSIF p_replace_id IS NOT NULL THEN
    RAISE EXCEPTION '%The payroll you are correcting is no longer current; reload and try again', p_label USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.actual_payroll (restaurant_id, location_id, period_month, amount, scope, scope_note, source,
    import_batch_id, document_id, supersedes_id, change_reason, created_by)
  VALUES (p_restaurant_id, p_location_id, p_period_month, round(p_amount, 2), p_scope, nullif(btrim(coalesce(p_scope_note,'')),''), p_source,
    p_batch_id, p_document_id, v_existing, CASE WHEN v_existing IS NULL THEN NULL ELSE btrim(p_reason) END, auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.log_audit_event(p_restaurant_id,
    CASE WHEN v_existing IS NULL THEN 'payroll_confirmed' ELSE 'payroll_corrected' END,
    format('Confirmed payroll %s for %s', to_char(round(p_amount,2), 'FM999999990.00'), to_char(p_period_month, 'FMMonth YYYY')),
    jsonb_build_object('payroll_id', v_id, 'location_id', p_location_id, 'period_month', p_period_month,
      'amount', round(p_amount,2), 'scope', p_scope, 'replaced_id', v_existing, 'reason', p_reason, 'source', p_source));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public._insert_actual_payroll(uuid, uuid, date, numeric, text, text, text, uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

-- 8. Public RPCs
CREATE OR REPLACE FUNCTION public.record_actual_payroll(
  p_restaurant_id uuid, p_location_id uuid, p_period_month date, p_amount numeric,
  p_scope text, p_scope_note text DEFAULT NULL, p_replace_payroll_id uuid DEFAULT NULL,
  p_change_reason text DEFAULT NULL, p_document_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.expense_finance_guard(p_restaurant_id);
  PERFORM public.expense_location_guard(p_restaurant_id, p_location_id, '');
  IF p_document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.documents WHERE id = p_document_id AND restaurant_id = p_restaurant_id) THEN
    RAISE EXCEPTION 'Source document does not belong to this restaurant' USING ERRCODE = '42501';
  END IF;
  RETURN public._insert_actual_payroll(p_restaurant_id, p_location_id, p_period_month, p_amount, p_scope, p_scope_note,
    'manual', NULL, p_document_id, p_replace_payroll_id, p_change_reason, '');
END $$;

CREATE OR REPLACE FUNCTION public.void_actual_payroll(p_payroll_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.actual_payroll%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.actual_payroll WHERE id = p_payroll_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll record not found' USING ERRCODE = '42704'; END IF;
  PERFORM public.expense_finance_guard(v.restaurant_id);
  PERFORM public.expense_location_guard(v.restaurant_id, v.location_id, '');
  IF v.status <> 'active' THEN RAISE EXCEPTION 'Only the current payroll can be removed' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason,''))) = 0 THEN RAISE EXCEPTION 'Give a reason' USING ERRCODE = '22023'; END IF;
  UPDATE public.actual_payroll SET status = 'void', ended_reason = btrim(p_reason), ended_by = auth.uid(), ended_at = now() WHERE id = p_payroll_id;
  PERFORM public.log_audit_event(v.restaurant_id, 'payroll_voided', format('Removed confirmed payroll for %s', to_char(v.period_month, 'FMMonth YYYY')),
    jsonb_build_object('payroll_id', v.id, 'location_id', v.location_id, 'period_month', v.period_month, 'amount', v.amount, 'reason', p_reason));
END $$;

CREATE OR REPLACE FUNCTION public.void_actual_expense(p_expense_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.actual_expenses%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.actual_expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found' USING ERRCODE = '42704'; END IF;
  PERFORM public.expense_finance_guard(v.restaurant_id);
  PERFORM public.expense_location_guard(v.restaurant_id, v.location_id, '');
  IF v.status <> 'active' THEN RAISE EXCEPTION 'This expense is already void' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason,''))) = 0 THEN RAISE EXCEPTION 'Give a reason' USING ERRCODE = '22023'; END IF;
  UPDATE public.actual_expenses SET status = 'void', void_reason = btrim(p_reason), voided_by = auth.uid(), voided_at = now(), updated_at = now() WHERE id = p_expense_id;
  PERFORM public.log_audit_event(v.restaurant_id, 'actual_expense_voided', format('Voided expense %s', v.description),
    jsonb_build_object('expense_id', v.id, 'amount', v.amount, 'period_month', v.period_month, 'reason', p_reason));
END $$;

CREATE OR REPLACE FUNCTION public.apply_expense_import(p_restaurant_id uuid, p_import jsonb, p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec record;
  r jsonb;
  v_label text;
  v_kind text;
  v_loc uuid;
  v_txt text;
  v_amount numeric;
  v_name text;
  v_supplier text;
  v_skey text;
  v_ref text;
  v_src text;
  v_confirm boolean;
  v_category text;
  v_freq text;
  v_start date;
  v_end date;
  v_month date;
  v_vat text;
  v_vat_amount numeric;
  v_cost_type text;
  v_replaces uuid;
  v_batch uuid;
  v_doc uuid;
  v_source text;
  v_dup text;
  n_est int := 0; n_act int := 0; n_pay int := 0;
  c_uuid text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  c_categories text[] := ARRAY['Rent','Utilities','Insurance','Marketing','Software','Licences','Waste','Internet',
    'Professional fees','Bank & card fees','Repairs & maintenance','Cleaning','Equipment','Other'];
BEGIN
  PERFORM public.expense_finance_guard(p_restaurant_id);
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'Nothing to import' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) > 2000 THEN
    RAISE EXCEPTION 'Too many rows in one import (max 2000)' USING ERRCODE = '22023';
  END IF;
  v_source := p_import->>'source_type';
  IF v_source IS NULL OR v_source NOT IN ('xlsx','csv','pdf','image','manual') THEN
    RAISE EXCEPTION 'Unknown file type' USING ERRCODE = '22023';
  END IF;
  v_txt := nullif(btrim(coalesce(p_import->>'document_id','')),'');
  IF v_txt IS NOT NULL THEN
    IF v_txt !~ c_uuid THEN RAISE EXCEPTION 'Invalid source document' USING ERRCODE = '22023'; END IF;
    v_doc := v_txt::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = v_doc AND restaurant_id = p_restaurant_id) THEN
      RAISE EXCEPTION 'Source document does not belong to this restaurant' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.expense_import_batches (restaurant_id, document_id, filename, file_hash, source_type, rows_skipped, summary, created_by)
  VALUES (p_restaurant_id, v_doc, left(coalesce(nullif(btrim(p_import->>'filename'),''), 'Expense import'), 250),
    nullif(left(coalesce(p_import->>'file_hash',''), 128), ''), v_source,
    greatest(0, coalesce((CASE WHEN (p_import->>'skipped_rows') ~ '^\d{1,6}$' THEN (p_import->>'skipped_rows')::int END), 0)),
    CASE WHEN jsonb_typeof(p_import->'summary') = 'object' THEN p_import->'summary' ELSE '{}'::jsonb END,
    auth.uid())
  RETURNING id INTO v_batch;

  FOR rec IN SELECT value AS row, ordinality AS idx FROM jsonb_array_elements(p_rows) WITH ORDINALITY LOOP
    r := rec.row;
    IF jsonb_typeof(r) <> 'object' THEN RAISE EXCEPTION 'Row % is malformed', rec.idx USING ERRCODE = '22023'; END IF;
    v_label := coalesce(nullif(left(btrim(coalesce(r->>'row_label','')), 120), ''), 'Row ' || rec.idx) || ': ';
    v_kind := r->>'kind';

    v_txt := nullif(btrim(coalesce(r->>'location_id','')),'');
    IF v_txt IS NULL OR v_txt !~ c_uuid THEN
      RAISE EXCEPTION '%Choose a location', v_label USING ERRCODE = '22023';
    END IF;
    v_loc := v_txt::uuid;
    PERFORM public.expense_location_guard(p_restaurant_id, v_loc, v_label);
    v_amount := public.expense_jamount(r->>'amount', v_label);

    IF v_kind = 'payroll' THEN
      v_month := public.expense_jdate(r->>'period_month', v_label, 'Accounting month');
      v_txt := nullif(btrim(coalesce(r->>'replace_payroll_id','')),'');
      IF v_txt IS NOT NULL AND v_txt !~ c_uuid THEN
        RAISE EXCEPTION '%Invalid payroll to correct', v_label USING ERRCODE = '22023';
      END IF;
      PERFORM public._insert_actual_payroll(p_restaurant_id, v_loc, v_month, v_amount, r->>'scope', r->>'scope_note',
        'accountant_import', v_batch, v_doc, v_txt::uuid, r->>'change_reason', v_label);
      n_pay := n_pay + 1;
      CONTINUE;
    END IF;

    IF v_kind IS NULL OR v_kind NOT IN ('estimate','actual') THEN
      RAISE EXCEPTION '%Choose what this row is', v_label USING ERRCODE = '22023';
    END IF;

    v_name := nullif(btrim(coalesce(r->>'name','')),'');
    IF v_name IS NULL THEN RAISE EXCEPTION '%Enter a name', v_label USING ERRCODE = '22023'; END IF;
    v_name := left(v_name, 200);
    v_supplier := nullif(left(btrim(coalesce(r->>'supplier_name','')), 200),'');
    v_category := r->>'category';
    IF v_category IS NULL OR NOT (v_category = ANY (c_categories)) THEN
      RAISE EXCEPTION '%Choose a category', v_label USING ERRCODE = '22023';
    END IF;
    v_vat := r->>'vat_treatment';
    IF v_vat IS NULL OR v_vat NOT IN ('unknown','inc_vat','ex_vat','no_vat') THEN
      RAISE EXCEPTION '%Choose the VAT treatment (Unknown is allowed)', v_label USING ERRCODE = '22023';
    END IF;
    v_cost_type := nullif(r->>'cost_type','');
    IF v_cost_type IS NOT NULL AND v_cost_type NOT IN ('fixed','variable') THEN
      RAISE EXCEPTION '%Fixed or variable only', v_label USING ERRCODE = '22023';
    END IF;

    IF v_kind = 'estimate' THEN
      v_freq := r->>'frequency';
      IF v_freq IS NULL OR v_freq NOT IN ('one_time','daily','weekly','monthly','quarterly','yearly') THEN
        RAISE EXCEPTION '%Choose how often this cost occurs', v_label USING ERRCODE = '22023';
      END IF;
      v_start := public.expense_jdate(r->>'start_date', v_label, 'Applies from');
      IF v_start IS NULL THEN RAISE EXCEPTION '%Choose the month this estimate applies from', v_label USING ERRCODE = '22023'; END IF;
      v_end := public.expense_jdate(r->>'end_date', v_label, 'Ends');
      IF v_end IS NOT NULL AND v_end < v_start THEN RAISE EXCEPTION '%End date is before start date', v_label USING ERRCODE = '22023'; END IF;
      IF EXISTS (
        SELECT 1 FROM public.overheads o
         WHERE o.restaurant_id = p_restaurant_id AND o.location_id = v_loc AND o.is_active
           AND lower(btrim(o.name)) = lower(v_name) AND round(o.amount, 2) = v_amount AND o.frequency = v_freq
           AND (o.end_date IS NULL OR o.end_date >= v_start)
           AND (v_end IS NULL OR o.start_date IS NULL OR o.start_date <= v_end)) THEN
        RAISE EXCEPTION '%"%" is already an active overhead with the same amount and frequency', v_label, v_name USING ERRCODE = '23505';
      END IF;
      INSERT INTO public.overheads (restaurant_id, location_id, name, category, amount, frequency, start_date, end_date, is_active,
        allocation_mode, allocation_details, supplier_name, cost_type, vat_treatment, notes, source_category, import_batch_id)
      VALUES (p_restaurant_id, v_loc, v_name, v_category, v_amount, v_freq, v_start, v_end, true,
        'single', '{}'::jsonb, v_supplier, v_cost_type, v_vat, nullif(left(btrim(coalesce(r->>'notes','')), 1000),''),
        nullif(left(btrim(coalesce(r->>'source_category','')), 200),''), v_batch);
      n_est := n_est + 1;
      CONTINUE;
    END IF;

    -- actual expense
    v_month := public.expense_jdate(r->>'period_month', v_label, 'Accounting month');
    IF v_month IS NULL THEN RAISE EXCEPTION '%Choose the accounting month', v_label USING ERRCODE = '22023'; END IF;
    IF v_month <> date_trunc('month', v_month)::date THEN RAISE EXCEPTION '%The accounting month must start on the 1st', v_label USING ERRCODE = '22023'; END IF;
    IF v_month > date_trunc('month', current_date)::date THEN RAISE EXCEPTION '%Actual expenses cannot be in a future month', v_label USING ERRCODE = '22023'; END IF;
    v_vat_amount := NULL;
    IF nullif(btrim(coalesce(r->>'vat_amount','')),'') IS NOT NULL THEN
      IF (r->>'vat_amount') !~ '^\d+(\.\d+)?$' THEN RAISE EXCEPTION '%VAT amount is not a number', v_label USING ERRCODE = '22023'; END IF;
      v_vat_amount := round((r->>'vat_amount')::numeric, 2);
      IF v_vat IN ('unknown','no_vat') THEN RAISE EXCEPTION '%A VAT amount needs VAT treatment "includes VAT" or "excludes VAT"', v_label USING ERRCODE = '22023'; END IF;
      IF v_vat = 'inc_vat' AND v_vat_amount >= v_amount THEN RAISE EXCEPTION '%VAT amount must be less than the total', v_label USING ERRCODE = '22023'; END IF;
    END IF;
    v_txt := nullif(btrim(coalesce(r->>'replaces_overhead_id','')),'');
    v_replaces := NULL;
    IF v_txt IS NOT NULL THEN
      IF v_txt !~ c_uuid THEN RAISE EXCEPTION '%Invalid estimate to replace', v_label USING ERRCODE = '22023'; END IF;
      v_replaces := v_txt::uuid;
      IF NOT EXISTS (SELECT 1 FROM public.overheads WHERE id = v_replaces AND restaurant_id = p_restaurant_id AND location_id = v_loc AND is_active) THEN
        RAISE EXCEPTION '%The estimate to replace must be an active overhead for the same location', v_label USING ERRCODE = '22023';
      END IF;
    END IF;

    v_skey := public.expense_supplier_key(v_supplier);
    v_ref := nullif(left(btrim(coalesce(r->>'invoice_reference','')), 120), '');
    v_src := nullif(left(btrim(coalesce(r->>'source_ref','')), 300), '');
    v_confirm := coalesce((r->>'confirm_possible_duplicate')::boolean, false);

    -- Definite duplicate of an existing supplier invoice (same supplier + same invoice number)
    IF v_ref IS NOT NULL AND v_skey <> '' AND EXISTS (
      SELECT 1 FROM public.supplier_invoices si JOIN public.suppliers s ON s.id = si.supplier_id
       WHERE si.restaurant_id = p_restaurant_id AND si.status <> 'void'
         AND lower(btrim(si.invoice_number)) = lower(v_ref)
         AND public.expense_supplier_key(s.name) = v_skey) THEN
      RAISE EXCEPTION '%Invoice % from % is already recorded as a supplier invoice', v_label, v_ref, v_supplier USING ERRCODE = '23505';
    END IF;

    -- Possible duplicate: same supplier/description/amount in the same month where either side has no invoice number,
    -- or a supplier invoice with the same supplier, month and amount. Needs explicit confirmation; never auto-rejected or merged.
    IF NOT v_confirm THEN
      SELECT format('%s %s', coalesce(e.invoice_reference, 'without an invoice number'), to_char(e.amount, 'FM999999990.00')) INTO v_dup
        FROM public.actual_expenses e
       WHERE e.restaurant_id = p_restaurant_id AND e.location_id = v_loc AND e.period_month = v_month AND e.status = 'active'
         AND e.dedupe_key = public.expense_dedupe_key(v_supplier, v_name, v_amount)
         AND (v_ref IS NULL OR e.invoice_reference IS NULL)
       LIMIT 1;
      IF v_dup IS NULL AND v_skey <> '' THEN
        SELECT format('supplier invoice %s', si.invoice_number) INTO v_dup
          FROM public.supplier_invoices si JOIN public.suppliers s ON s.id = si.supplier_id
         WHERE si.restaurant_id = p_restaurant_id AND si.location_id = v_loc AND si.status <> 'void'
           AND date_trunc('month', si.invoice_date)::date = v_month
           AND public.expense_supplier_key(s.name) = v_skey
           AND (round(si.gross_amount, 2) = v_amount OR round(coalesce(si.net_amount, -1), 2) = v_amount)
           AND (v_ref IS NULL OR lower(btrim(si.invoice_number)) <> lower(v_ref))
         LIMIT 1;
        -- A different invoice number on both sides means a genuinely separate bill
        IF v_dup IS NOT NULL AND v_ref IS NOT NULL THEN v_dup := NULL; END IF;
      END IF;
      IF v_dup IS NOT NULL THEN
        RAISE EXCEPTION '%Possible duplicate of %; review and confirm it is a separate bill', v_label, v_dup USING ERRCODE = 'P0001', HINT = 'possible_duplicate';
      END IF;
    END IF;

    BEGIN
      INSERT INTO public.actual_expenses (restaurant_id, location_id, period_month, bill_date, supplier_name, supplier_key, invoice_reference,
        source_ref, description, category, source_category, amount, vat_treatment, vat_amount, cost_type, replaces_overhead_id,
        import_batch_id, document_id, notes, dedupe_key, duplicate_confirmed, created_by)
      VALUES (p_restaurant_id, v_loc, v_month, public.expense_jdate(r->>'bill_date', v_label, 'Bill date'), v_supplier, v_skey, v_ref,
        v_src, v_name, v_category, nullif(left(btrim(coalesce(r->>'source_category','')), 200),''), v_amount, v_vat, v_vat_amount,
        v_cost_type, v_replaces, v_batch, v_doc, nullif(left(btrim(coalesce(r->>'notes','')), 1000),''),
        public.expense_dedupe_key(v_supplier, v_name, v_amount), v_confirm, auth.uid());
    EXCEPTION WHEN unique_violation THEN
      IF v_ref IS NOT NULL AND EXISTS (SELECT 1 FROM public.actual_expenses e WHERE e.restaurant_id = p_restaurant_id AND e.location_id = v_loc
           AND e.status = 'active' AND e.supplier_key = v_skey AND lower(btrim(e.invoice_reference)) = lower(v_ref)) THEN
        RAISE EXCEPTION '%Invoice % from % is already recorded', v_label, v_ref, coalesce(v_supplier, 'this supplier') USING ERRCODE = '23505';
      END IF;
      RAISE EXCEPTION '%This row of this file was already imported', v_label USING ERRCODE = '23505';
    END;
    n_act := n_act + 1;
  END LOOP;

  UPDATE public.expense_import_batches SET rows_estimate = n_est, rows_actual = n_act, rows_payroll = n_pay WHERE id = v_batch;
  PERFORM public.log_audit_event(p_restaurant_id, 'expense_import', format('Imported expenses from %s', p_import->>'filename'),
    jsonb_build_object('batch_id', v_batch, 'estimates', n_est, 'actuals', n_act, 'payroll', n_pay));
  RETURN jsonb_build_object('batch_id', v_batch, 'estimates', n_est, 'actuals', n_act, 'payroll', n_pay);
END $$;

REVOKE ALL ON FUNCTION public.apply_expense_import(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_actual_payroll(uuid, uuid, date, numeric, text, text, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_actual_payroll(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_actual_expense(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expense_finance_guard(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expense_location_guard(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.actual_finance_tenant_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_expense_import(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_actual_payroll(uuid, uuid, date, numeric, text, text, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_actual_payroll(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_actual_expense(uuid, text) TO authenticated;