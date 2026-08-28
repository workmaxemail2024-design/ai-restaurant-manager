DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);

    IF fn.proname IN (
      'enforce_membership_authorization',
      'enforce_staff_pay_authorization',
      'reduce_stock_on_sale',
      'sync_daily_expense_total',
      'update_stock_on_purchase',
      'update_updated_at_column',
      'create_default_automation_rules'
    ) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    END IF;
  END LOOP;
END;
$$;