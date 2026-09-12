ALTER TABLE public.pos_daily_summaries
  ALTER COLUMN gross_sales DROP NOT NULL,
  ALTER COLUMN gross_sales DROP DEFAULT,
  ALTER COLUMN net_sales   DROP NOT NULL,
  ALTER COLUMN net_sales   DROP DEFAULT,
  ALTER COLUMN vat_amount  DROP NOT NULL,
  ALTER COLUMN vat_amount  DROP DEFAULT,
  ALTER COLUMN discounts   DROP NOT NULL,
  ALTER COLUMN discounts   DROP DEFAULT;

ALTER TABLE public.pos_daily_summaries
  ADD COLUMN IF NOT EXISTS product_gross_sales numeric,
  ADD COLUMN IF NOT EXISTS product_net_sales   numeric,
  ADD COLUMN IF NOT EXISTS product_vat_amount  numeric,
  ADD COLUMN IF NOT EXISTS product_discounts   numeric,
  ADD COLUMN IF NOT EXISTS summary_gross_sales numeric,
  ADD COLUMN IF NOT EXISTS summary_net_sales   numeric,
  ADD COLUMN IF NOT EXISTS summary_vat_amount  numeric,
  ADD COLUMN IF NOT EXISTS summary_discounts   numeric,
  ADD COLUMN IF NOT EXISTS has_product_detail  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_summary_report  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS product_source_file text,
  ADD COLUMN IF NOT EXISTS summary_source_file text;

UPDATE public.pos_daily_summaries
SET product_gross_sales = gross_sales, product_net_sales = net_sales,
    product_vat_amount  = vat_amount,  product_discounts = discounts,
    product_source_file = source_file_name, has_product_detail = true
WHERE pos_provider = 'captiva_xls' AND has_product_detail = false;

UPDATE public.pos_daily_summaries
SET summary_gross_sales = gross_sales, summary_net_sales = net_sales,
    summary_vat_amount  = vat_amount,  summary_discounts = discounts,
    summary_source_file = source_file_name, has_summary_report = true
WHERE pos_provider IN ('captiva','captiva_api') AND has_summary_report = false;

CREATE OR REPLACE FUNCTION public.upsert_pos_daily_summary(
  p_restaurant_id uuid, p_location_id uuid, p_pos_provider text, p_report_date date,
  p_report_kind text,
  p_gross numeric DEFAULT NULL, p_net numeric DEFAULT NULL,
  p_vat numeric DEFAULT NULL,   p_discounts numeric DEFAULT NULL,
  p_order_count integer DEFAULT NULL, p_visitor_count integer DEFAULT NULL,
  p_average_order_value numeric DEFAULT NULL, p_source_file text DEFAULT NULL
) RETURNS public.pos_daily_summaries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.pos_daily_summaries;
  v_products boolean := (p_report_kind = 'products');
  v_internal boolean := public.is_trusted_backend_session();
BEGIN
  IF p_report_kind NOT IN ('products','summary') THEN
    RAISE EXCEPTION 'p_report_kind must be products or summary'; END IF;
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'p_location_id is required'; END IF;

  IF v_internal THEN
    IF p_pos_provider NOT IN ('captiva_xls','captiva','captiva_api') THEN
      RAISE EXCEPTION 'Unsupported POS provider %', p_pos_provider USING ERRCODE = '42501'; END IF;
  ELSE
    IF NOT public.user_belongs_to_restaurant(p_restaurant_id) THEN
      RAISE EXCEPTION 'Not authorised for this restaurant' USING ERRCODE = '42501'; END IF;
    IF NOT public.user_can_access_location(p_location_id) THEN
      RAISE EXCEPTION 'Not authorised for this location' USING ERRCODE = '42501'; END IF;
    IF NOT (public.user_is_owner() OR public.user_has_pos_admin()) THEN
      RAISE EXCEPTION 'POS import permission required' USING ERRCODE = '42501'; END IF;
    IF p_pos_provider <> 'captiva_xls' THEN
      RAISE EXCEPTION 'Manual POS import only supports the captiva_xls provider' USING ERRCODE = '42501'; END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.locations l
                 WHERE l.id = p_location_id AND l.restaurant_id = p_restaurant_id) THEN
    RAISE EXCEPTION 'Location does not belong to this restaurant'; END IF;

  IF public.day_is_closed(p_restaurant_id, p_location_id, p_report_date) THEN
    RAISE EXCEPTION 'Day % is closed for this location. Reopen it before importing POS data.', p_report_date
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.pos_daily_summaries AS s (
    restaurant_id, location_id, pos_provider, report_date,
    gross_sales, net_sales, vat_amount, discounts,
    order_count, visitor_count, average_order_value, source_file_name,
    product_gross_sales, product_net_sales, product_vat_amount, product_discounts,
    summary_gross_sales, summary_net_sales, summary_vat_amount, summary_discounts,
    has_product_detail, has_summary_report, product_source_file, summary_source_file)
  VALUES (
    p_restaurant_id, p_location_id, p_pos_provider, p_report_date,
    p_gross, p_net, p_vat, p_discounts,
    p_order_count, p_visitor_count, p_average_order_value, p_source_file,
    CASE WHEN v_products THEN p_gross END, CASE WHEN v_products THEN p_net END,
    CASE WHEN v_products THEN p_vat END,   CASE WHEN v_products THEN p_discounts END,
    CASE WHEN NOT v_products THEN p_gross END, CASE WHEN NOT v_products THEN p_net END,
    CASE WHEN NOT v_products THEN p_vat END,   CASE WHEN NOT v_products THEN p_discounts END,
    v_products, NOT v_products,
    CASE WHEN v_products THEN p_source_file END,
    CASE WHEN NOT v_products THEN p_source_file END)
  ON CONFLICT (restaurant_id,
               COALESCE(location_id,'00000000-0000-0000-0000-000000000000'::uuid),
               pos_provider, report_date)
  DO UPDATE SET
    product_gross_sales = CASE WHEN v_products THEN COALESCE(p_gross, s.product_gross_sales) ELSE s.product_gross_sales END,
    product_net_sales   = CASE WHEN v_products THEN COALESCE(p_net, s.product_net_sales) ELSE s.product_net_sales END,
    product_vat_amount  = CASE WHEN v_products THEN COALESCE(p_vat, s.product_vat_amount) ELSE s.product_vat_amount END,
    product_discounts   = CASE WHEN v_products THEN COALESCE(p_discounts, s.product_discounts) ELSE s.product_discounts END,
    summary_gross_sales = CASE WHEN v_products THEN s.summary_gross_sales ELSE COALESCE(p_gross, s.summary_gross_sales) END,
    summary_net_sales   = CASE WHEN v_products THEN s.summary_net_sales   ELSE COALESCE(p_net, s.summary_net_sales) END,
    summary_vat_amount  = CASE WHEN v_products THEN s.summary_vat_amount  ELSE COALESCE(p_vat, s.summary_vat_amount) END,
    summary_discounts   = CASE WHEN v_products THEN s.summary_discounts   ELSE COALESCE(p_discounts, s.summary_discounts) END,
    has_product_detail  = s.has_product_detail OR v_products,
    has_summary_report  = s.has_summary_report OR NOT v_products,
    product_source_file = CASE WHEN v_products THEN COALESCE(p_source_file, s.product_source_file) ELSE s.product_source_file END,
    summary_source_file = CASE WHEN v_products THEN s.summary_source_file ELSE COALESCE(p_source_file, s.summary_source_file) END,
    order_count      = COALESCE(p_order_count, s.order_count),
    visitor_count    = COALESCE(p_visitor_count, s.visitor_count),
    source_file_name = COALESCE(p_source_file, s.source_file_name),
    updated_at = now()
  RETURNING * INTO v_row;

  UPDATE public.pos_daily_summaries s SET
    gross_sales = COALESCE(CASE WHEN s.has_product_detail THEN s.product_gross_sales END, s.summary_gross_sales),
    net_sales   = COALESCE(CASE WHEN s.has_product_detail THEN s.product_net_sales   END, s.summary_net_sales),
    vat_amount  = COALESCE(CASE WHEN s.has_product_detail THEN s.product_vat_amount  END, s.summary_vat_amount),
    discounts   = COALESCE(CASE WHEN s.has_product_detail THEN s.product_discounts   END, s.summary_discounts),
    average_order_value = CASE
      WHEN p_average_order_value IS NOT NULL THEN p_average_order_value
      WHEN s.order_count > 0 AND COALESCE(CASE WHEN s.has_product_detail THEN s.product_gross_sales END, s.summary_gross_sales) IS NOT NULL
        THEN ROUND(COALESCE(CASE WHEN s.has_product_detail THEN s.product_gross_sales END, s.summary_gross_sales) / s.order_count, 2)
      ELSE NULL END
  WHERE s.id = v_row.id RETURNING * INTO v_row;

  RETURN v_row;
END; $$;

REVOKE ALL ON FUNCTION public.upsert_pos_daily_summary(uuid,uuid,text,date,text,numeric,numeric,numeric,numeric,integer,integer,numeric,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_pos_daily_summary(uuid,uuid,text,date,text,numeric,numeric,numeric,numeric,integer,integer,numeric,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_pos_daily_summary(uuid,uuid,text,date,text,numeric,numeric,numeric,numeric,integer,integer,numeric,text) TO authenticated, service_role;