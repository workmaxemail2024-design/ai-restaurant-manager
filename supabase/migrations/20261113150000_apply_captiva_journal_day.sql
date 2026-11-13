-- Draft only: DO NOT run until reviewed on an isolated Supabase staging copy.
-- Atomic journal-product application, intentionally separate from legacy receipt-based apply.
-- Service-role only; the invoking edge function authenticates caller and tenant.
CREATE OR REPLACE FUNCTION public.apply_captiva_journal_day(
  p_integration_id uuid,
  p_report_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_integration public.pos_integrations%ROWTYPE;
  v_restaurant uuid;
  v_location uuid;
  v_total integer;
  v_batch_count integer;
  v_batch_id text;
  v_expected_count integer;
  v_expected_gross bigint;
  v_expected_net bigint;
  v_expected_vat bigint;
  v_gross bigint;
  v_net bigint;
  v_vat bigint;
  v_orders integer;
  v_visitors integer;
  v_unmapped integer;
  v_summary_id uuid;
  v_affected integer;
BEGIN
  IF p_report_date IS NULL THEN
    RAISE EXCEPTION 'Trading date is required';
  END IF;

  SELECT * INTO v_integration
  FROM public.pos_integrations
  WHERE id = p_integration_id AND pos_provider = 'captiva'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Captiva integration not found'; END IF;
  v_restaurant := v_integration.restaurant_id;
  v_location := v_integration.location_id;
  IF v_restaurant IS NULL OR v_location IS NULL THEN
    RAISE EXCEPTION 'Integration missing restaurant or location';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_location::text), hashtext(p_report_date::text));

  IF EXISTS (
    SELECT 1 FROM public.daily_ledger_entries
    WHERE restaurant_id = v_restaurant
      AND (location_id = v_location OR location_id IS NULL)
      AND entry_date = p_report_date AND is_closed = true
  ) THEN
    RAISE EXCEPTION 'Trading day is closed and cannot be modified';
  END IF;

  -- No cross-source duplication: *any* non-Captiva sales already on that day
  -- require a manual reconciliation/migration, not blind addition.
  IF EXISTS (
    SELECT 1 FROM public.sales
    WHERE restaurant_id = v_restaurant
      AND location_id = v_location
      AND sale_date = p_report_date
      AND source <> 'captiva'
  ) OR EXISTS (
    SELECT 1 FROM public.pos_sales_import
    WHERE restaurant_id = v_restaurant AND location_id = v_location
      AND mapped_sale_date = p_report_date AND pos_provider = 'captiva_xls'
  ) OR EXISTS (
    SELECT 1 FROM public.pos_daily_summaries
    WHERE restaurant_id = v_restaurant AND location_id = v_location
      AND report_date = p_report_date AND pos_provider = 'captiva_xls'
  ) THEN
    RAISE EXCEPTION 'Another sales source already owns this date. Manual review required.';
  END IF;

  -- The staged payloads carry only aggregate controls, never customer records.
  -- Require one complete batch with identical controls on every product row.
  SELECT count(*)::integer,
         count(DISTINCT data->>'batch_id')::integer,
         min(data->>'batch_id'),
         min((data->>'expected_product_count')::integer),
         min((data->>'expected_gross_cents')::bigint),
         min((data->>'expected_net_cents')::bigint),
         min((data->>'expected_vat_cents')::bigint),
         min((data->>'expected_orders')::integer),
         min((data->>'expected_visitors')::integer),
         coalesce(sum(round(mapped_total_price::numeric * 100)), 0)::bigint
    INTO v_total, v_batch_count, v_batch_id,
         v_expected_count, v_expected_gross, v_expected_net,
         v_expected_vat, v_orders, v_visitors, v_gross
  FROM public.pos_sales_import
  WHERE restaurant_id = v_restaurant AND location_id = v_location
    AND mapped_sale_date = p_report_date AND pos_provider = 'captiva'
    AND data->>'source' = 'captiva_journal_api_v1';

  IF v_total IS NULL OR v_total = 0 OR v_batch_count <> 1 OR v_batch_id IS NULL
     OR v_total <> v_expected_count OR v_gross <> v_expected_gross THEN
    RAISE EXCEPTION 'Incomplete or inconsistent staged Captiva journal; refresh before applying';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pos_sales_import
    WHERE restaurant_id = v_restaurant AND location_id = v_location
      AND mapped_sale_date = p_report_date AND pos_provider = 'captiva'
      AND (data->>'source' IS DISTINCT FROM 'captiva_journal_api_v1'
           OR data->>'batch_id' IS DISTINCT FROM v_batch_id
           OR (data->>'expected_product_count')::integer IS DISTINCT FROM v_expected_count
           OR (data->>'expected_gross_cents')::bigint IS DISTINCT FROM v_expected_gross
           OR (data->>'expected_net_cents')::bigint IS DISTINCT FROM v_expected_net
           OR (data->>'expected_vat_cents')::bigint IS DISTINCT FROM v_expected_vat
           OR (data->>'expected_orders')::integer IS DISTINCT FROM v_orders
           OR (data->>'expected_visitors')::integer IS DISTINCT FROM v_visitors
           OR mapped_total_price IS NULL OR mapped_quantity IS NULL OR mapped_quantity < 0)
  ) THEN
    RAISE EXCEPTION 'Inconsistent or legacy Captiva staged rows; no data applied';
  END IF;

  IF v_expected_net IS NULL OR v_expected_vat IS NULL
     OR abs(v_expected_gross - (v_expected_net + v_expected_vat)) > 1
     OR v_orders IS NULL OR v_orders < 0 OR v_visitors IS NULL OR v_visitors < 0 THEN
    RAISE EXCEPTION 'Invalid daily Captiva financial totals';
  END IF;

  -- Do not silently create or guess master dishes. An explicit mapping must
  -- already exist for EVERY sellable product; reused PLUs require separate IDs.
  SELECT count(*)::integer INTO v_unmapped
  FROM public.pos_sales_import i
  LEFT JOIN public.external_pos_items x
    ON x.restaurant_id = i.restaurant_id AND x.location_id = i.location_id
   AND x.pos_provider = 'captiva' AND x.external_item_id = i.external_item_id
  LEFT JOIN public.dishes d
    ON d.id = coalesce(x.mapped_dish_id, i.mapped_dish_id)
   AND d.restaurant_id = v_restaurant
   AND (d.location_id IS NULL OR d.location_id = v_location)
  WHERE i.restaurant_id = v_restaurant AND i.location_id = v_location
    AND i.pos_provider = 'captiva' AND i.mapped_sale_date = p_report_date
    AND d.id IS NULL;
  IF v_unmapped > 0 THEN
    RAISE EXCEPTION '% products still require dish mapping; nothing has been applied', v_unmapped;
  END IF;

  -- Re-validate before writing; the transaction will roll back on ANY failure.
  INSERT INTO public.sales (
      restaurant_id, location_id, dish_id, quantity, total_price,
      sale_date, source, pos_import_id
  )
  SELECT v_restaurant, v_location,
         coalesce(x.mapped_dish_id, i.mapped_dish_id),
         i.mapped_quantity, i.mapped_total_price,
         p_report_date, 'captiva', i.id
  FROM public.pos_sales_import i
  LEFT JOIN public.external_pos_items x
    ON x.restaurant_id = i.restaurant_id AND x.location_id = i.location_id
   AND x.pos_provider = 'captiva' AND x.external_item_id = i.external_item_id
  WHERE i.restaurant_id = v_restaurant AND i.location_id = v_location
    AND i.pos_provider = 'captiva' AND i.mapped_sale_date = p_report_date
  ON CONFLICT (pos_import_id) WHERE pos_import_id IS NOT NULL
  DO UPDATE SET dish_id = EXCLUDED.dish_id, quantity = EXCLUDED.quantity,
    total_price = EXCLUDED.total_price, sale_date = EXCLUDED.sale_date,
    source = EXCLUDED.source;

  -- Remove superseded rows from earlier Captiva API versions, never XLS/manual rows.
  DELETE FROM public.sales s
  WHERE s.restaurant_id = v_restaurant AND s.location_id = v_location
    AND s.sale_date = p_report_date AND s.source = 'captiva'
    AND NOT EXISTS (
      SELECT 1 FROM public.pos_sales_import i
      WHERE i.id = s.pos_import_id AND i.restaurant_id = v_restaurant
        AND i.location_id = v_location AND i.mapped_sale_date = p_report_date
        AND i.pos_provider = 'captiva' AND i.data->>'batch_id' = v_batch_id
    );

  -- Maintain one canonical provider+day summary. The net/VAT figures are from
  -- Captiva's dashboard, not fabricated per-product tax allocations.
  SELECT id INTO v_summary_id
  FROM public.pos_daily_summaries
  WHERE restaurant_id = v_restaurant AND location_id = v_location
    AND pos_provider = 'captiva' AND report_date = p_report_date
  FOR UPDATE;

  IF v_summary_id IS NULL THEN
    INSERT INTO public.pos_daily_summaries (
      restaurant_id, location_id, pos_provider, report_date,
      gross_sales, net_sales, vat_amount, discounts,
      product_gross_sales, product_net_sales, product_vat_amount,
      summary_gross_sales, summary_net_sales, summary_vat_amount,
      has_product_detail, has_summary_report, order_count, visitor_count,
      average_order_value, source_file_name, updated_at
    ) VALUES (
      v_restaurant, v_location, 'captiva', p_report_date,
      v_expected_gross / 100.0, v_expected_net / 100.0,
      v_expected_vat / 100.0, NULL,
      v_expected_gross / 100.0, v_expected_net / 100.0,
      v_expected_vat / 100.0,
      v_expected_gross / 100.0, v_expected_net / 100.0,
      v_expected_vat / 100.0,
      true, true, v_orders, v_visitors,
      CASE WHEN v_orders > 0 THEN round(v_expected_gross / (100.0 * v_orders), 2) ELSE NULL END,
      'Captiva Cloud Journal API', now()
    );
  ELSE
    UPDATE public.pos_daily_summaries SET
      gross_sales = v_expected_gross / 100.0,
      net_sales = v_expected_net / 100.0,
      vat_amount = v_expected_vat / 100.0,
      product_gross_sales = v_expected_gross / 100.0,
      product_net_sales = v_expected_net / 100.0,
      product_vat_amount = v_expected_vat / 100.0,
      summary_gross_sales = v_expected_gross / 100.0,
      summary_net_sales = v_expected_net / 100.0,
      summary_vat_amount = v_expected_vat / 100.0,
      has_product_detail = true, has_summary_report = true,
      order_count = v_orders, visitor_count = v_visitors,
      average_order_value = CASE WHEN v_orders > 0 THEN round(v_expected_gross / (100.0 * v_orders), 2) ELSE NULL END,
      source_file_name = 'Captiva Cloud Journal API',
      updated_at = now()
    WHERE id = v_summary_id;
  END IF;

  UPDATE public.pos_sales_import SET sync_status = 'applied'
  WHERE restaurant_id = v_restaurant AND location_id = v_location
    AND mapped_sale_date = p_report_date AND pos_provider = 'captiva'
    AND data->>'batch_id' = v_batch_id;
  GET DIAGNOSTICS v_affected = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true, 'report_date', p_report_date, 'applied_count', v_affected,
    'total_revenue', v_expected_gross / 100.0, 'gross_cents', v_expected_gross,
    'net_cents', v_expected_net, 'vat_cents', v_expected_vat,
    'order_count', v_orders, 'visitor_count', v_visitors
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_captiva_journal_day(uuid,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_captiva_journal_day(uuid,date) TO service_role;
