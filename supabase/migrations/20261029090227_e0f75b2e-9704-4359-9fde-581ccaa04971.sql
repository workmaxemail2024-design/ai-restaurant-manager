
-- ===== Fix: 'completed' = approved order; only 'received' is protected =====
CREATE OR REPLACE FUNCTION public.guard_po_receiving_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.is_trusted_backend_session() OR current_setting('app.ledger_write', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.received_at IS NOT NULL OR NEW.status = 'received' OR NEW.delivery_date IS NOT NULL THEN
      RAISE EXCEPTION 'Use Receive delivery to mark goods as received' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.received_at IS DISTINCT FROM OLD.received_at
     OR NEW.delivery_date IS DISTINCT FROM OLD.delivery_date
     OR NEW.received_by IS DISTINCT FROM OLD.received_by
     OR (NEW.status IS DISTINCT FROM OLD.status AND (NEW.status = 'received' OR OLD.status = 'received' OR OLD.received_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Use Receive delivery to mark goods as received' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_purchase_order_id uuid, p_delivery_date date, p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_po record; l jsonb; v_item record; v_qty numeric; v_cost numeric; v_at timestamptz; v_n int := 0;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_purchase_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF p_delivery_date IS NULL THEN RAISE EXCEPTION 'Enter the date the goods physically arrived'; END IF;
  PERFORM public.ledger_guard(v_po.restaurant_id, v_po.location_id, p_delivery_date);
  IF v_po.received_at IS NOT NULL OR v_po.status = 'received' THEN
    RAISE EXCEPTION 'This delivery has already been received' USING ERRCODE = '23505';
  END IF;
  IF v_po.status = 'cancelled' THEN RAISE EXCEPTION 'This order is cancelled'; END IF;
  IF jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION 'Malformed delivery lines'; END IF;
  PERFORM set_config('app.ledger_write', 'on', true);
  v_at := public.ledger_effective_at(p_delivery_date);
  FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_item FROM public.purchase_order_items
     WHERE id = public.import_juuid(l->'item_id') AND purchase_order_id = p_purchase_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Delivery line does not belong to this order'; END IF;
    v_qty := public.import_jnum(l->'received_quantity');
    v_cost := public.import_jnum(l->'unit_cost');
    IF v_qty IS NULL OR v_qty < 0 THEN RAISE EXCEPTION 'Received quantity must be zero or more'; END IF;
    IF v_cost IS NOT NULL AND v_cost < 0 THEN RAISE EXCEPTION 'Unit cost cannot be negative'; END IF;
    UPDATE public.purchase_order_items SET received_quantity = v_qty, received_unit_cost = v_cost WHERE id = v_item.id;
    IF v_qty > 0 THEN
      PERFORM public.ledger_apply_movement(v_po.restaurant_id, v_po.location_id, v_item.ingredient_id, 'receipt', v_qty, v_at,
        v_cost, CASE WHEN v_cost IS NULL THEN 'unknown' ELSE 'receipt_line' END,
        'purchase_order', p_purchase_order_id, v_item.id, NULL, 'Delivery received');
      v_n := v_n + 1;
    END IF;
  END LOOP;
  UPDATE public.purchase_orders SET status = 'received', received_at = now(), delivery_date = p_delivery_date,
         received_by = auth.uid() WHERE id = p_purchase_order_id;
  PERFORM set_config('app.ledger_write', 'off', true);
  PERFORM public.log_audit_event(v_po.restaurant_id, 'inventory_correction', 'Delivery received',
    jsonb_build_object('purchase_order_id', p_purchase_order_id, 'delivery_date', p_delivery_date, 'lines', v_n));
  RETURN p_purchase_order_id;
END; $$;

-- ===== Cost class: food & beverage vs non-food =====
CREATE OR REPLACE FUNCTION public.ingredient_cost_class(p_group text, p_type text, p_category text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_group IN ('food','beverage') THEN 'food_bev'
    WHEN p_group = 'operational' OR p_type = 'operational' THEN 'non_food'
    WHEN p_category IN ('packaging','cleaning','ppe') THEN 'non_food'
    WHEN p_category IS NOT NULL AND p_category <> 'other' THEN 'food_bev'
    ELSE 'unclassified' END
$$;

-- ===== Phase 2: invoices, lines, payments =====
CREATE TABLE public.supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  doc_type text NOT NULL DEFAULT 'invoice' CHECK (doc_type IN ('invoice','credit_note')),
  invoice_number text NOT NULL CHECK (length(btrim(invoice_number)) > 0),
  invoice_date date NOT NULL,
  due_date date,
  net_amount numeric,
  vat_amount numeric,
  gross_amount numeric NOT NULL CHECK (gross_amount >= 0),
  expense_class text NOT NULL DEFAULT 'stock' CHECK (expense_class IN ('stock','overhead')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','verified','void')),
  document_id uuid REFERENCES public.documents(id) ON DELETE RESTRICT,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  credits_invoice_id uuid REFERENCES public.supplier_invoices(id) ON DELETE RESTRICT,
  notes text,
  void_reason text,
  verified_by uuid, verified_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX supplier_invoices_number_uq ON public.supplier_invoices(restaurant_id, supplier_id, lower(btrim(invoice_number)), doc_type) WHERE status <> 'void';
CREATE UNIQUE INDEX supplier_invoices_receipt_uq ON public.supplier_invoices(purchase_order_id) WHERE purchase_order_id IS NOT NULL AND status <> 'void';
CREATE INDEX supplier_invoices_rest_date_idx ON public.supplier_invoices(restaurant_id, invoice_date);
GRANT SELECT ON public.supplier_invoices TO authenticated;
GRANT ALL ON public.supplier_invoices TO service_role;
ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant read supplier_invoices" ON public.supplier_invoices FOR SELECT TO authenticated USING (public.user_belongs_to_restaurant(restaurant_id));
CREATE POLICY "Location scope restrict" ON public.supplier_invoices AS RESTRICTIVE FOR SELECT TO authenticated USING (public.user_can_access_location(location_id));
CREATE TRIGGER update_supplier_invoices_updated_at BEFORE UPDATE ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.supplier_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE RESTRICT,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  line_no int NOT NULL,
  description text NOT NULL,
  product_code text,
  quantity numeric,
  pack_size numeric CHECK (pack_size IS NULL OR pack_size > 0),
  pack_unit text CHECK (pack_unit IS NULL OR pack_unit IN ('each','g','kg','ml','L')),
  unit_price numeric,
  line_total numeric,
  vat_rate numeric,
  is_stock boolean NOT NULL DEFAULT true,
  supplier_product_id uuid REFERENCES public.supplier_products(id) ON DELETE RESTRICT,
  ingredient_id uuid REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  stock_quantity numeric CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  match_status text NOT NULL DEFAULT 'unresolved' CHECK (match_status IN ('exact','confirmed','non_stock','unresolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, line_no)
);
GRANT SELECT ON public.supplier_invoice_lines TO authenticated;
GRANT ALL ON public.supplier_invoice_lines TO service_role;
ALTER TABLE public.supplier_invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant read supplier_invoice_lines" ON public.supplier_invoice_lines FOR SELECT TO authenticated USING (public.user_belongs_to_restaurant(restaurant_id));

CREATE TABLE public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  payment_date date NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  method text,
  reference text,
  notes text,
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','void')),
  void_reason text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supplier_payments_rest_date_idx ON public.supplier_payments(restaurant_id, payment_date);
GRANT SELECT ON public.supplier_payments TO authenticated;
GRANT ALL ON public.supplier_payments TO service_role;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant read supplier_payments" ON public.supplier_payments FOR SELECT TO authenticated USING (public.user_belongs_to_restaurant(restaurant_id));

CREATE TABLE public.supplier_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL REFERENCES public.supplier_payments(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, invoice_id)
);
GRANT SELECT ON public.supplier_payment_allocations TO authenticated;
GRANT ALL ON public.supplier_payment_allocations TO service_role;
ALTER TABLE public.supplier_payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant read supplier_payment_allocations" ON public.supplier_payment_allocations FOR SELECT TO authenticated USING (public.user_belongs_to_restaurant(restaurant_id));

-- ===== Phase 4: statements =====
CREATE TABLE public.supplier_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  statement_date date NOT NULL,
  period_start date,
  period_end date,
  closing_balance numeric NOT NULL,
  document_id uuid REFERENCES public.documents(id) ON DELETE RESTRICT,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, supplier_id, statement_date)
);
GRANT SELECT ON public.supplier_statements TO authenticated;
GRANT ALL ON public.supplier_statements TO service_role;
ALTER TABLE public.supplier_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant read supplier_statements" ON public.supplier_statements FOR SELECT TO authenticated USING (public.user_belongs_to_restaurant(restaurant_id));

CREATE TABLE public.supplier_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES public.supplier_statements(id) ON DELETE RESTRICT,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  line_date date,
  reference text,
  line_type text NOT NULL CHECK (line_type IN ('invoice','credit_note','payment','other')),
  amount numeric NOT NULL,
  matched_invoice_id uuid REFERENCES public.supplier_invoices(id) ON DELETE RESTRICT,
  matched_payment_id uuid REFERENCES public.supplier_payments(id) ON DELETE RESTRICT,
  match_status text NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('auto','confirmed','unmatched')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.supplier_statement_lines TO authenticated;
GRANT ALL ON public.supplier_statement_lines TO service_role;
ALTER TABLE public.supplier_statement_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant read supplier_statement_lines" ON public.supplier_statement_lines FOR SELECT TO authenticated USING (public.user_belongs_to_restaurant(restaurant_id));

-- ===== Guards =====
CREATE OR REPLACE FUNCTION public.finance_guard(p_restaurant_id uuid, p_payments boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_trusted_backend_session() THEN RETURN; END IF;
  IF auth.uid() IS NULL OR NOT public.user_belongs_to_restaurant(p_restaurant_id)
     OR public.get_user_restaurant_id() IS DISTINCT FROM p_restaurant_id THEN
    RAISE EXCEPTION 'Not authorized for this restaurant' USING ERRCODE = '42501';
  END IF;
  IF p_payments THEN
    IF NOT (public.user_is_owner() OR public.user_has_permission('suppliers','admin')) THEN
      RAISE EXCEPTION 'Recording supplier payments needs Owner or Suppliers admin permission' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.can_edit_inventory() THEN
    RAISE EXCEPTION 'You need Inventory Edit permission for supplier invoices' USING ERRCODE = '42501';
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.finance_guard(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Save or replace a DRAFT invoice with its lines (one transaction)
CREATE OR REPLACE FUNCTION public.save_supplier_invoice_draft(p_invoice jsonb, p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_rest uuid; v_loc uuid; v_sup uuid; v_doc uuid; v_old record; l jsonb; n int := 0;
        v_sp uuid; v_ing uuid; v_status text; v_credits uuid;
BEGIN
  v_loc := public.import_juuid(p_invoice, 'location_id');
  SELECT restaurant_id INTO v_rest FROM public.locations WHERE id = v_loc;
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Choose a location'; END IF;
  PERFORM public.finance_guard(v_rest);
  IF NOT public.user_can_access_location(v_loc) THEN RAISE EXCEPTION 'No access to this location' USING ERRCODE='42501'; END IF;
  v_sup := public.import_juuid(p_invoice, 'supplier_id');
  IF v_sup IS NULL OR NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = v_sup AND restaurant_id = v_rest) THEN RAISE EXCEPTION 'Choose a supplier from this restaurant'; END IF;
  v_doc := public.import_juuid(p_invoice, 'document_id');
  IF v_doc IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.documents WHERE id = v_doc AND restaurant_id = v_rest) THEN RAISE EXCEPTION 'Document belongs to another restaurant'; END IF;
  v_credits := public.import_juuid(p_invoice, 'credits_invoice_id');
  IF v_credits IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.supplier_invoices WHERE id = v_credits AND restaurant_id = v_rest AND supplier_id = v_sup AND doc_type = 'invoice') THEN RAISE EXCEPTION 'Credited invoice not found for this supplier'; END IF;
  IF COALESCE(p_invoice->>'invoice_number','') = '' OR COALESCE(p_invoice->>'invoice_date','') = '' THEN RAISE EXCEPTION 'Invoice number and invoice date are required'; END IF;
  IF public.import_jnum(p_invoice, 'gross_amount') IS NULL THEN RAISE EXCEPTION 'Enter the invoice total'; END IF;
  IF jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION 'Malformed invoice lines'; END IF;

  v_id := public.import_juuid(p_invoice, 'id');
  IF v_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.supplier_invoices WHERE id = v_id FOR UPDATE;
    IF NOT FOUND OR v_old.restaurant_id <> v_rest THEN RAISE EXCEPTION 'Invoice not found'; END IF;
    IF v_old.status <> 'draft' THEN RAISE EXCEPTION 'Only draft invoices can be edited; void and re-enter a verified invoice'; END IF;
    UPDATE public.supplier_invoices SET location_id = v_loc, supplier_id = v_sup,
      doc_type = COALESCE(p_invoice->>'doc_type','invoice'), invoice_number = btrim(p_invoice->>'invoice_number'),
      invoice_date = (p_invoice->>'invoice_date')::date, due_date = NULLIF(p_invoice->>'due_date','')::date,
      net_amount = public.import_jnum(p_invoice,'net_amount'), vat_amount = public.import_jnum(p_invoice,'vat_amount'),
      gross_amount = public.import_jnum(p_invoice,'gross_amount'), expense_class = COALESCE(p_invoice->>'expense_class','stock'),
      document_id = v_doc, credits_invoice_id = v_credits, notes = p_invoice->>'notes'
     WHERE id = v_id;
    DELETE FROM public.supplier_invoice_lines WHERE invoice_id = v_id;
  ELSE
    INSERT INTO public.supplier_invoices(restaurant_id, location_id, supplier_id, doc_type, invoice_number, invoice_date, due_date,
      net_amount, vat_amount, gross_amount, expense_class, document_id, credits_invoice_id, notes)
    VALUES (v_rest, v_loc, v_sup, COALESCE(p_invoice->>'doc_type','invoice'), btrim(p_invoice->>'invoice_number'),
      (p_invoice->>'invoice_date')::date, NULLIF(p_invoice->>'due_date','')::date,
      public.import_jnum(p_invoice,'net_amount'), public.import_jnum(p_invoice,'vat_amount'), public.import_jnum(p_invoice,'gross_amount'),
      COALESCE(p_invoice->>'expense_class','stock'), v_doc, v_credits, p_invoice->>'notes')
    RETURNING id INTO v_id;
  END IF;

  FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    n := n + 1;
    v_sp := public.import_juuid(l, 'supplier_product_id');
    v_ing := public.import_juuid(l, 'ingredient_id');
    IF v_sp IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.supplier_products WHERE id = v_sp AND restaurant_id = v_rest AND supplier_id = v_sup) THEN
      RAISE EXCEPTION 'Line %: supplier product belongs to another supplier', n; END IF;
    IF v_ing IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ingredients WHERE id = v_ing AND restaurant_id = v_rest) THEN
      RAISE EXCEPTION 'Line %: item not in this restaurant', n; END IF;
    IF v_sp IS NOT NULL AND v_ing IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.supplier_products WHERE id = v_sp AND ingredient_id = v_ing) THEN
      RAISE EXCEPTION 'Line %: supplier product is linked to a different inventory item', n; END IF;
    v_status := COALESCE(l->>'match_status','unresolved');
    INSERT INTO public.supplier_invoice_lines(invoice_id, restaurant_id, line_no, description, product_code, quantity, pack_size, pack_unit,
      unit_price, line_total, vat_rate, is_stock, supplier_product_id, ingredient_id, stock_quantity, match_status)
    VALUES (v_id, v_rest, n, COALESCE(NULLIF(btrim(l->>'description'),''), 'Line ' || n), NULLIF(btrim(l->>'product_code'),''),
      public.import_jnum(l,'quantity'), public.import_jnum(l,'pack_size'), NULLIF(l->>'pack_unit',''),
      public.import_jnum(l,'unit_price'), public.import_jnum(l,'line_total'), public.import_jnum(l,'vat_rate'),
      COALESCE((l->>'is_stock')::boolean, true), v_sp, v_ing, public.import_jnum(l,'stock_quantity'), v_status);
  END LOOP;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'This supplier invoice number has already been entered' USING ERRCODE = '23505';
END; $$;

-- Verify: totals must reconcile, every line resolved. Optionally records supplier prices (append-only).
CREATE OR REPLACE FUNCTION public.verify_supplier_invoice(p_invoice_id uuid, p_record_supplier_prices boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; v_sum numeric; v_bad int; v_prices int := 0; l record; v_cpb numeric; v_target numeric;
BEGIN
  SELECT * INTO v FROM public.supplier_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  PERFORM public.finance_guard(v.restaurant_id);
  IF v.status <> 'draft' THEN RAISE EXCEPTION 'Invoice is already %', v.status; END IF;
  SELECT count(*) INTO v_bad FROM public.supplier_invoice_lines WHERE invoice_id = p_invoice_id
    AND (match_status = 'unresolved' OR line_total IS NULL OR (is_stock AND (ingredient_id IS NULL OR stock_quantity IS NULL)));
  IF v_bad > 0 THEN RAISE EXCEPTION '% line(s) still need a total, an inventory item and a stock quantity (or mark them non-stock)', v_bad; END IF;
  SELECT COALESCE(SUM(line_total),0) INTO v_sum FROM public.supplier_invoice_lines WHERE invoice_id = p_invoice_id;
  v_target := COALESCE(v.net_amount, v.gross_amount);
  IF abs(v_sum - v_target) > 0.05 AND abs(v_sum - v.gross_amount) > 0.05 THEN
    RAISE EXCEPTION 'Line totals (%) do not match the invoice net/total (%). Fix the lines before verifying.', round(v_sum,2), round(v_target,2);
  END IF;
  IF v.net_amount IS NOT NULL AND v.vat_amount IS NOT NULL AND abs(v.net_amount + v.vat_amount - v.gross_amount) > 0.05 THEN
    RAISE EXCEPTION 'Net + VAT does not equal the invoice total';
  END IF;
  IF p_record_supplier_prices AND v.doc_type = 'invoice' THEN
    FOR l IN SELECT * FROM public.supplier_invoice_lines WHERE invoice_id = p_invoice_id
             AND supplier_product_id IS NOT NULL AND pack_size IS NOT NULL AND pack_unit IS NOT NULL AND unit_price > 0 LOOP
      v_cpb := public.supplier_cost_per_base(l.unit_price, l.pack_size, l.pack_unit);
      IF v_cpb IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.supplier_product_prices p
           WHERE p.supplier_product_id = l.supplier_product_id AND p.effective_date = v.invoice_date AND p.cost_per_pack = l.unit_price
             AND p.pack_size = l.pack_size AND p.pack_unit = l.pack_unit) THEN
        INSERT INTO public.supplier_product_prices(restaurant_id, supplier_product_id, effective_date, cost_per_pack, pack_size, pack_unit,
          base_unit, cost_per_base_unit, source, document_id, note, created_by)
        VALUES (v.restaurant_id, l.supplier_product_id, v.invoice_date, l.unit_price, l.pack_size, l.pack_unit,
          public.normalize_unit(l.pack_unit), v_cpb, 'invoice', v.document_id, 'Invoice ' || v.invoice_number, auth.uid());
        v_prices := v_prices + 1;
      END IF;
    END LOOP;
  END IF;
  UPDATE public.supplier_invoices SET status = 'verified', verified_by = auth.uid(), verified_at = now() WHERE id = p_invoice_id;
  PERFORM public.log_audit_event(v.restaurant_id, 'inventory_correction', 'Supplier invoice verified',
    jsonb_build_object('invoice_id', p_invoice_id, 'number', v.invoice_number, 'supplier_prices_recorded', v_prices));
  RETURN jsonb_build_object('supplier_prices_recorded', v_prices);
END; $$;

CREATE OR REPLACE FUNCTION public.void_supplier_invoice(p_invoice_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.supplier_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  PERFORM public.finance_guard(v.restaurant_id);
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN RAISE EXCEPTION 'Give a reason'; END IF;
  IF v.status = 'void' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.supplier_payment_allocations a JOIN public.supplier_payments p ON p.id = a.payment_id
             WHERE a.invoice_id = p_invoice_id AND p.status = 'recorded') THEN
    RAISE EXCEPTION 'Void the payments allocated to this invoice first';
  END IF;
  UPDATE public.supplier_invoices SET status = 'void', void_reason = p_reason WHERE id = p_invoice_id;
  PERFORM public.log_audit_event(v.restaurant_id, 'inventory_correction', 'Supplier invoice voided',
    jsonb_build_object('invoice_id', p_invoice_id, 'reason', p_reason, 'had_receipt', v.purchase_order_id IS NOT NULL));
END; $$;

-- Link a verified invoice to a delivery that was already received (adds NO stock)
CREATE OR REPLACE FUNCTION public.link_invoice_receipt(p_invoice_id uuid, p_purchase_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; po record;
BEGIN
  SELECT * INTO v FROM public.supplier_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  PERFORM public.finance_guard(v.restaurant_id);
  IF v.status = 'void' THEN RAISE EXCEPTION 'Invoice is void'; END IF;
  IF v.purchase_order_id IS NOT NULL THEN RAISE EXCEPTION 'This invoice is already linked to a delivery'; END IF;
  SELECT * INTO po FROM public.purchase_orders WHERE id = p_purchase_order_id;
  IF NOT FOUND OR po.restaurant_id <> v.restaurant_id OR po.supplier_id <> v.supplier_id THEN RAISE EXCEPTION 'Delivery not found for this supplier'; END IF;
  IF po.received_at IS NULL THEN RAISE EXCEPTION 'That order has not been received yet'; END IF;
  UPDATE public.supplier_invoices SET purchase_order_id = p_purchase_order_id WHERE id = p_invoice_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'That delivery is already linked to another invoice' USING ERRCODE = '23505';
END; $$;

-- Receive goods from a verified invoice on their physical delivery date
CREATE OR REPLACE FUNCTION public.receive_invoice_goods(p_invoice_id uuid, p_delivery_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; v_lines jsonb; v_po uuid;
BEGIN
  SELECT * INTO v FROM public.supplier_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  PERFORM public.finance_guard(v.restaurant_id);
  IF v.status <> 'verified' THEN RAISE EXCEPTION 'Verify the invoice first'; END IF;
  IF v.doc_type <> 'invoice' THEN RAISE EXCEPTION 'Credit notes do not add stock; record a stock adjustment or reversal'; END IF;
  IF v.purchase_order_id IS NOT NULL THEN RAISE EXCEPTION 'Goods for this invoice were already received' USING ERRCODE = '23505'; END IF;
  SELECT jsonb_agg(jsonb_build_object('ingredient_id', ingredient_id, 'quantity', stock_quantity,
           'unit_cost', CASE WHEN stock_quantity > 0 AND line_total IS NOT NULL THEN round(line_total / stock_quantity, 6) END))
    INTO v_lines FROM public.supplier_invoice_lines
   WHERE invoice_id = p_invoice_id AND is_stock AND ingredient_id IS NOT NULL AND stock_quantity > 0;
  IF v_lines IS NULL THEN RAISE EXCEPTION 'This invoice has no stock lines to receive'; END IF;
  v_po := public.receive_direct_delivery(v.supplier_id, v.location_id, p_delivery_date, v_lines);
  UPDATE public.supplier_invoices SET purchase_order_id = v_po WHERE id = p_invoice_id;
  RETURN v_po;
END; $$;

CREATE OR REPLACE FUNCTION public.invoice_outstanding(p_invoice_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN i.status <> 'verified' THEN 0 ELSE
    i.gross_amount
    - COALESCE((SELECT SUM(a.amount) FROM public.supplier_payment_allocations a JOIN public.supplier_payments p ON p.id = a.payment_id
                WHERE a.invoice_id = i.id AND p.status = 'recorded'), 0)
    - COALESCE((SELECT SUM(c.gross_amount) FROM public.supplier_invoices c WHERE c.credits_invoice_id = i.id AND c.status = 'verified' AND c.doc_type = 'credit_note'), 0)
  END
  FROM public.supplier_invoices i WHERE i.id = p_invoice_id AND public.user_belongs_to_restaurant(i.restaurant_id)
$$;

CREATE OR REPLACE FUNCTION public.record_supplier_payment(p_supplier_id uuid, p_payment_date date, p_amount numeric,
  p_method text, p_reference text, p_allocations jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid; v_id uuid; a jsonb; v_inv uuid; v_amt numeric; v_total numeric := 0; v_out numeric;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.suppliers WHERE id = p_supplier_id;
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Supplier not found'; END IF;
  PERFORM public.finance_guard(v_rest, true);
  IF p_payment_date IS NULL OR p_payment_date > CURRENT_DATE THEN RAISE EXCEPTION 'Enter the date the payment was actually made'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be above zero'; END IF;
  INSERT INTO public.supplier_payments(restaurant_id, supplier_id, payment_date, amount, method, reference)
  VALUES (v_rest, p_supplier_id, p_payment_date, p_amount, p_method, p_reference) RETURNING id INTO v_id;
  FOR a IN SELECT * FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb)) LOOP
    v_inv := public.import_juuid(a, 'invoice_id'); v_amt := public.import_jnum(a, 'amount');
    IF v_inv IS NULL OR v_amt IS NULL OR v_amt <= 0 THEN RAISE EXCEPTION 'Malformed allocation'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.supplier_invoices WHERE id = v_inv AND supplier_id = p_supplier_id AND status = 'verified' AND doc_type = 'invoice') THEN
      RAISE EXCEPTION 'Payments can only be allocated to verified invoices of this supplier'; END IF;
    v_out := public.invoice_outstanding(v_inv);
    IF v_amt > v_out + 0.005 THEN RAISE EXCEPTION 'Allocation (%) is more than the amount outstanding (%)', v_amt, round(v_out,2); END IF;
    INSERT INTO public.supplier_payment_allocations(restaurant_id, payment_id, invoice_id, amount) VALUES (v_rest, v_id, v_inv, v_amt);
    v_total := v_total + v_amt;
  END LOOP;
  IF v_total > p_amount + 0.005 THEN RAISE EXCEPTION 'Allocations exceed the payment amount'; END IF;
  PERFORM public.log_audit_event(v_rest, 'inventory_correction', 'Supplier payment recorded',
    jsonb_build_object('payment_id', v_id, 'amount', p_amount, 'date', p_payment_date));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.void_supplier_payment(p_payment_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.supplier_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  PERFORM public.finance_guard(v.restaurant_id, true);
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN RAISE EXCEPTION 'Give a reason'; END IF;
  UPDATE public.supplier_payments SET status = 'void', void_reason = p_reason WHERE id = p_payment_id;
  PERFORM public.log_audit_event(v.restaurant_id, 'inventory_correction', 'Supplier payment voided', jsonb_build_object('payment_id', p_payment_id, 'reason', p_reason));
END; $$;

-- ===== Phase 4 statement functions =====
CREATE OR REPLACE FUNCTION public.save_supplier_statement(p_supplier_id uuid, p_statement_date date, p_period_start date,
  p_period_end date, p_closing_balance numeric, p_document_id uuid, p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid; v_id uuid; l jsonb;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.suppliers WHERE id = p_supplier_id;
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Supplier not found'; END IF;
  PERFORM public.finance_guard(v_rest);
  IF p_document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.documents WHERE id = p_document_id AND restaurant_id = v_rest) THEN RAISE EXCEPTION 'Document belongs to another restaurant'; END IF;
  INSERT INTO public.supplier_statements(restaurant_id, supplier_id, statement_date, period_start, period_end, closing_balance, document_id)
  VALUES (v_rest, p_supplier_id, p_statement_date, p_period_start, p_period_end, p_closing_balance, p_document_id) RETURNING id INTO v_id;
  FOR l IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines,'[]'::jsonb)) LOOP
    IF public.import_jnum(l,'amount') IS NULL THEN RAISE EXCEPTION 'Every statement line needs an amount'; END IF;
    INSERT INTO public.supplier_statement_lines(statement_id, restaurant_id, line_date, reference, line_type, amount)
    VALUES (v_id, v_rest, NULLIF(l->>'line_date','')::date, NULLIF(btrim(l->>'reference'),''), COALESCE(l->>'line_type','invoice'), public.import_jnum(l,'amount'));
  END LOOP;
  PERFORM public.reconcile_supplier_statement(v_id);
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'A statement for this supplier and date already exists';
END; $$;

CREATE OR REPLACE FUNCTION public.reconcile_supplier_statement(p_statement_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; l record; v_inv uuid; v_pay uuid; v_ours numeric;
BEGIN
  SELECT * INTO s FROM public.supplier_statements WHERE id = p_statement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Statement not found'; END IF;
  IF NOT public.is_trusted_backend_session() AND NOT public.user_belongs_to_restaurant(s.restaurant_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  FOR l IN SELECT * FROM public.supplier_statement_lines WHERE statement_id = p_statement_id AND match_status = 'unmatched' LOOP
    v_inv := NULL; v_pay := NULL;
    IF l.line_type IN ('invoice','credit_note') AND l.reference IS NOT NULL THEN
      SELECT id INTO v_inv FROM public.supplier_invoices WHERE restaurant_id = s.restaurant_id AND supplier_id = s.supplier_id
        AND status <> 'void' AND doc_type = CASE WHEN l.line_type = 'credit_note' THEN 'credit_note' ELSE 'invoice' END
        AND lower(btrim(invoice_number)) = lower(btrim(l.reference)) LIMIT 1;
    ELSIF l.line_type = 'payment' THEN
      SELECT id INTO v_pay FROM public.supplier_payments WHERE restaurant_id = s.restaurant_id AND supplier_id = s.supplier_id AND status = 'recorded'
        AND abs(amount - abs(l.amount)) < 0.01
        AND ((l.reference IS NOT NULL AND lower(reference) = lower(l.reference)) OR (l.line_date IS NOT NULL AND abs(payment_date - l.line_date) <= 3))
        AND NOT EXISTS (SELECT 1 FROM public.supplier_statement_lines x WHERE x.statement_id = p_statement_id AND x.matched_payment_id = supplier_payments.id)
      ORDER BY abs(payment_date - COALESCE(l.line_date, payment_date)) LIMIT 1;
    END IF;
    IF v_inv IS NOT NULL OR v_pay IS NOT NULL THEN
      UPDATE public.supplier_statement_lines SET matched_invoice_id = v_inv, matched_payment_id = v_pay, match_status = 'auto' WHERE id = l.id;
    END IF;
  END LOOP;
  SELECT COALESCE((SELECT SUM(CASE WHEN doc_type='invoice' THEN gross_amount ELSE -gross_amount END) FROM public.supplier_invoices
           WHERE restaurant_id = s.restaurant_id AND supplier_id = s.supplier_id AND status = 'verified' AND invoice_date <= s.statement_date),0)
       - COALESCE((SELECT SUM(amount) FROM public.supplier_payments WHERE restaurant_id = s.restaurant_id AND supplier_id = s.supplier_id
           AND status = 'recorded' AND payment_date <= s.statement_date),0)
    INTO v_ours;
  RETURN jsonb_build_object('our_balance', v_ours, 'statement_balance', s.closing_balance, 'difference', s.closing_balance - v_ours);
END; $$;

CREATE OR REPLACE FUNCTION public.confirm_statement_match(p_line_id uuid, p_invoice_id uuid, p_payment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; s record;
BEGIN
  SELECT * INTO l FROM public.supplier_statement_lines WHERE id = p_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Line not found'; END IF;
  SELECT * INTO s FROM public.supplier_statements WHERE id = l.statement_id;
  PERFORM public.finance_guard(s.restaurant_id);
  IF p_invoice_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.supplier_invoices WHERE id = p_invoice_id AND supplier_id = s.supplier_id AND restaurant_id = s.restaurant_id) THEN RAISE EXCEPTION 'Invoice not for this supplier'; END IF;
  IF p_payment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.supplier_payments WHERE id = p_payment_id AND supplier_id = s.supplier_id AND restaurant_id = s.restaurant_id) THEN RAISE EXCEPTION 'Payment not for this supplier'; END IF;
  UPDATE public.supplier_statement_lines SET matched_invoice_id = p_invoice_id, matched_payment_id = p_payment_id,
    match_status = CASE WHEN p_invoice_id IS NULL AND p_payment_id IS NULL THEN 'unmatched' ELSE 'confirmed' END WHERE id = p_line_id;
END; $$;

-- ===== Phase 3: valuation and actual food cost =====
CREATE OR REPLACE FUNCTION public.get_period_actual_food_cost(p_restaurant_id uuid, p_location_id uuid, p_start date, p_end date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_locs uuid[]; v_open_at timestamptz; v_close_at timestamptz; r record; reasons text[] := '{}';
  open_fb numeric := 0; close_fb numeric := 0; open_nf numeric := 0; close_nf numeric := 0;
  rec_fb numeric := 0; rec_nf numeric := 0; waste_fb numeric := 0; waste_nf numeric := 0;
  unk_items int := 0; unk_receipts int := 0; neg_items int := 0; unclassified int := 0;
  theo numeric := 0; theo_unc numeric := 0; theo_cov numeric; rev numeric := 0; loc uuid;
  v_cost numeric; v_class text; draft_inv int; unlinked_inv int; unlinked_rec int;
  missing_open int := 0; missing_close int := 0; t record;
BEGIN
  IF NOT public.is_trusted_backend_session() AND NOT public.user_belongs_to_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  SELECT array_agg(id) INTO v_locs FROM public.locations
   WHERE restaurant_id = p_restaurant_id AND (p_location_id IS NULL OR id = p_location_id)
     AND (public.is_trusted_backend_session() OR public.user_can_access_location(id));
  IF v_locs IS NULL THEN RAISE EXCEPTION 'No accessible location'; END IF;
  v_open_at := (p_start::timestamp AT TIME ZONE 'UTC') - interval '1 microsecond';
  v_close_at := ((p_end + 1)::timestamp AT TIME ZONE 'UTC') - interval '1 microsecond';

  -- Opening / closing valuation per item at dated cost
  FOR r IN SELECT m.ingredient_id, m.location_id, i.item_group, i.item_type, i.category, i.unit::text unit,
                  SUM(CASE WHEN m.effective_at <= v_open_at THEN m.quantity ELSE 0 END) q_open,
                  SUM(CASE WHEN m.effective_at <= v_close_at THEN m.quantity ELSE 0 END) q_close
             FROM public.stock_movements m JOIN public.ingredients i ON i.id = m.ingredient_id
            WHERE m.location_id = ANY(v_locs) GROUP BY 1,2,3,4,5,6 LOOP
    v_class := public.ingredient_cost_class(r.item_group, r.item_type, r.category);
    IF v_class = 'unclassified' AND (r.q_open <> 0 OR r.q_close <> 0) THEN unclassified := unclassified + 1; END IF;
    IF r.q_open <> 0 THEN
      v_cost := public.ledger_stock_unit_cost(r.ingredient_id, p_start - 1);
      IF v_cost IS NULL THEN unk_items := unk_items + 1;
      ELSIF v_class = 'non_food' THEN open_nf := open_nf + r.q_open * v_cost; ELSE open_fb := open_fb + r.q_open * v_cost; END IF;
    END IF;
    IF r.q_close <> 0 THEN
      v_cost := public.ledger_stock_unit_cost(r.ingredient_id, p_end);
      IF v_cost IS NULL THEN unk_items := unk_items + 1;
      ELSIF v_class = 'non_food' THEN close_nf := close_nf + r.q_close * v_cost; ELSE close_fb := close_fb + r.q_close * v_cost; END IF;
    END IF;
    IF r.q_close < 0 THEN neg_items := neg_items + 1; END IF;
  END LOOP;

  -- Movements inside the period
  FOR r IN SELECT m.*, i.item_group, i.item_type, i.category, o.movement_type orig_type
             FROM public.stock_movements m JOIN public.ingredients i ON i.id = m.ingredient_id
             LEFT JOIN public.stock_movements o ON o.id = m.reverses_movement_id
            WHERE m.location_id = ANY(v_locs) AND m.effective_at > v_open_at AND m.effective_at <= v_close_at
              AND m.movement_type IN ('receipt','waste','spoilage','damage','theft','staff_meal','other','reversal') LOOP
    v_class := public.ingredient_cost_class(r.item_group, r.item_type, r.category);
    IF COALESCE(r.orig_type, r.movement_type) = 'receipt' THEN
      IF r.unit_cost IS NULL THEN unk_receipts := unk_receipts + 1;
      ELSIF v_class = 'non_food' THEN rec_nf := rec_nf + r.quantity * r.unit_cost; ELSE rec_fb := rec_fb + r.quantity * r.unit_cost; END IF;
    ELSIF COALESCE(r.orig_type, r.movement_type) IN ('waste','spoilage','damage','theft','staff_meal','other') THEN
      IF r.unit_cost IS NULL THEN unk_items := unk_items + 1;
      ELSIF v_class = 'non_food' THEN waste_nf := waste_nf - r.quantity * r.unit_cost; ELSE waste_fb := waste_fb - r.quantity * r.unit_cost; END IF;
    END IF;
  END LOOP;

  -- Count anchors near both boundaries for every location
  FOREACH loc IN ARRAY v_locs LOOP
    IF NOT EXISTS (SELECT 1 FROM public.stock_counts WHERE location_id = loc AND count_date BETWEEN p_start - 3 AND p_start) THEN missing_open := missing_open + 1; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.stock_counts WHERE location_id = loc AND count_date BETWEEN p_end - 3 AND p_end + 3) THEN missing_close := missing_close + 1; END IF;
    SELECT * INTO t FROM public.get_period_food_cost(loc, p_start, p_end, 30);
    theo := theo + COALESCE(t.historical_food_cost,0) + COALESCE(t.fallback_food_cost,0);
    theo_unc := theo_unc + COALESCE(t.uncosted_revenue,0);
    rev := rev + COALESCE(t.total_revenue,0);
  END LOOP;

  SELECT count(*) INTO draft_inv FROM public.supplier_invoices WHERE location_id = ANY(v_locs) AND status = 'draft' AND invoice_date BETWEEN p_start AND p_end;
  SELECT count(*) INTO unlinked_inv FROM public.supplier_invoices WHERE location_id = ANY(v_locs) AND status = 'verified' AND doc_type = 'invoice'
     AND expense_class = 'stock' AND purchase_order_id IS NULL AND invoice_date BETWEEN p_start AND p_end;
  SELECT count(*) INTO unlinked_rec FROM public.purchase_orders po WHERE po.location_id = ANY(v_locs) AND po.received_at IS NOT NULL
     AND po.delivery_date BETWEEN p_start AND p_end
     AND NOT EXISTS (SELECT 1 FROM public.supplier_invoices si WHERE si.purchase_order_id = po.id AND si.status <> 'void');

  IF missing_open > 0 THEN reasons := reasons || format('No stock count at the start of the period (%s location(s))', missing_open); END IF;
  IF missing_close > 0 THEN reasons := reasons || format('No stock count at the end of the period (%s location(s))', missing_close); END IF;
  IF unk_receipts > 0 THEN reasons := reasons || format('%s delivery line(s) without a cost', unk_receipts); END IF;
  IF unk_items > 0 THEN reasons := reasons || format('%s stock/waste value(s) without a known item cost', unk_items); END IF;
  IF neg_items > 0 THEN reasons := reasons || format('%s item(s) with negative stock', neg_items); END IF;
  IF unclassified > 0 THEN reasons := reasons || format('%s item(s) not classified as food, beverage or non-food', unclassified); END IF;
  IF theo_unc > 0 THEN reasons := reasons || 'Some sales have no recipe cost (theoretical cost incomplete)'; END IF;
  IF draft_inv > 0 THEN reasons := reasons || format('%s supplier invoice(s) not yet verified', draft_inv); END IF;
  IF unlinked_inv > 0 THEN reasons := reasons || format('%s verified stock invoice(s) without a recorded delivery', unlinked_inv); END IF;
  IF unlinked_rec > 0 THEN reasons := reasons || format('%s delivery(ies) without a matching invoice', unlinked_rec); END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN array_length(reasons,1) IS NULL THEN 'complete' ELSE 'estimate' END,
    'reasons', to_jsonb(reasons),
    'revenue', rev,
    'opening_value', open_fb, 'closing_value', close_fb, 'receipts_value', rec_fb, 'waste_value', waste_fb,
    'actual_cogs', open_fb + rec_fb - close_fb,
    'theoretical_cogs', theo,
    'theoretical_uncosted_revenue', theo_unc,
    'unexplained_variance', (open_fb + rec_fb - close_fb) - theo - waste_fb,
    'non_food', jsonb_build_object('opening_value', open_nf, 'closing_value', close_nf, 'receipts_value', rec_nf, 'waste_value', waste_nf,
                                   'usage', open_nf + rec_nf - close_nf)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.get_supplier_cashflow(p_restaurant_id uuid, p_start date, p_end date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_paid_stock numeric; v_paid_overhead numeric; v_unalloc numeric; v_payables numeric; v_overdue numeric;
BEGIN
  IF NOT public.is_trusted_backend_session() AND NOT public.user_belongs_to_restaurant(p_restaurant_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(SUM(a.amount) FILTER (WHERE i.expense_class = 'stock'),0), COALESCE(SUM(a.amount) FILTER (WHERE i.expense_class = 'overhead'),0)
    INTO v_paid_stock, v_paid_overhead
    FROM public.supplier_payments p JOIN public.supplier_payment_allocations a ON a.payment_id = p.id JOIN public.supplier_invoices i ON i.id = a.invoice_id
   WHERE p.restaurant_id = p_restaurant_id AND p.status = 'recorded' AND p.payment_date BETWEEN p_start AND p_end;
  SELECT COALESCE(SUM(p.amount - COALESCE((SELECT SUM(a.amount) FROM public.supplier_payment_allocations a WHERE a.payment_id = p.id),0)),0)
    INTO v_unalloc FROM public.supplier_payments p
   WHERE p.restaurant_id = p_restaurant_id AND p.status = 'recorded' AND p.payment_date BETWEEN p_start AND p_end;
  SELECT COALESCE(SUM(public.invoice_outstanding(id)),0), COALESCE(SUM(public.invoice_outstanding(id)) FILTER (WHERE due_date < CURRENT_DATE),0)
    INTO v_payables, v_overdue FROM public.supplier_invoices
   WHERE restaurant_id = p_restaurant_id AND status = 'verified' AND doc_type = 'invoice';
  RETURN jsonb_build_object('paid_stock', v_paid_stock, 'paid_overhead_invoices', v_paid_overhead, 'unallocated_payments', v_unalloc,
                            'payables_outstanding', v_payables, 'payables_overdue', v_overdue);
END; $$;

-- ===== Execution rights =====
REVOKE ALL ON FUNCTION public.ingredient_cost_class(text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_supplier_invoice_draft(jsonb,jsonb), public.verify_supplier_invoice(uuid,boolean),
  public.void_supplier_invoice(uuid,text), public.link_invoice_receipt(uuid,uuid), public.receive_invoice_goods(uuid,date),
  public.invoice_outstanding(uuid), public.record_supplier_payment(uuid,date,numeric,text,text,jsonb), public.void_supplier_payment(uuid,text),
  public.save_supplier_statement(uuid,date,date,date,numeric,uuid,jsonb), public.reconcile_supplier_statement(uuid),
  public.confirm_statement_match(uuid,uuid,uuid), public.get_period_actual_food_cost(uuid,uuid,date,date),
  public.get_supplier_cashflow(uuid,date,date), public.receive_purchase_order(uuid,date,jsonb), public.guard_po_receiving_fields() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ingredient_cost_class(text,text,text), public.save_supplier_invoice_draft(jsonb,jsonb), public.verify_supplier_invoice(uuid,boolean),
  public.void_supplier_invoice(uuid,text), public.link_invoice_receipt(uuid,uuid), public.receive_invoice_goods(uuid,date),
  public.invoice_outstanding(uuid), public.record_supplier_payment(uuid,date,numeric,text,text,jsonb), public.void_supplier_payment(uuid,text),
  public.save_supplier_statement(uuid,date,date,date,numeric,uuid,jsonb), public.reconcile_supplier_statement(uuid),
  public.confirm_statement_match(uuid,uuid,uuid), public.get_period_actual_food_cost(uuid,uuid,date,date),
  public.get_supplier_cashflow(uuid,date,date), public.receive_purchase_order(uuid,date,jsonb) TO authenticated;
