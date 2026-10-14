
CREATE OR REPLACE FUNCTION public.import_juuid(_v jsonb) RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = public AS
$$ SELECT public.import_juuid(jsonb_build_object('value', _v), 'value') $$;
CREATE OR REPLACE FUNCTION public.import_jnum(_v jsonb) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS
$$ SELECT public.import_jnum(jsonb_build_object('value', _v), 'value') $$;
REVOKE ALL ON FUNCTION public.import_juuid(jsonb), public.import_jnum(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_movements_tenant_check(), public.stock_movements_immutable(),
  public.guard_po_receiving_fields(), public.guard_po_item_receiving_fields(),
  public.ledger_effective_at(date, boolean) FROM PUBLIC, anon;
