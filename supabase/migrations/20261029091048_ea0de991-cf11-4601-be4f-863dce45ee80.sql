
CREATE OR REPLACE FUNCTION public.ledger_stock_unit_cost(p_ingredient_id uuid, p_date date)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_base numeric; v_unit text; v_f numeric; v_rec numeric;
BEGIN
  SELECT unit::text INTO v_unit FROM public.ingredients WHERE id = p_ingredient_id;
  SELECT cost INTO v_base FROM public.get_ingredient_cost_at_date(p_ingredient_id, p_date);
  v_f := public.unit_factor(v_unit);
  IF v_base IS NOT NULL AND v_f IS NOT NULL THEN RETURN v_base * v_f; END IF;
  SELECT unit_cost INTO v_rec FROM public.stock_movements
   WHERE ingredient_id = p_ingredient_id AND movement_type = 'receipt' AND unit_cost IS NOT NULL
     AND effective_date <= COALESCE(p_date, CURRENT_DATE)
     AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reverses_movement_id = stock_movements.id)
   ORDER BY effective_at DESC LIMIT 1;
  RETURN v_rec;
END; $$;
REVOKE ALL ON FUNCTION public.ledger_stock_unit_cost(uuid,date) FROM PUBLIC, anon;
