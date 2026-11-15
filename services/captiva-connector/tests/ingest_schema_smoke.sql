-- Synthetic ingestion tests only (run AFTER exception_schema_smoke.sql).
-- Never run against production Supabase.

insert into public.pos_captiva_store_bindings(store_id,restaurant_id,location_id,active)
values
('01584','10000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000001',true),
('02137','10000000-0000-4000-8000-000000000002',
 '20000000-0000-4000-8000-000000000002',true);

set role service_role;

select public.pos_stage_captiva_envelope(
  '01584','2026-09-02',repeat('a',64),
  '{"store_id":"01584","trading_date":"2026-09-02",
    "journal_filename":"jnl_02sep2026_01584_example.xml",
    "journal_coverage":"complete",
    "official_gross":"50.00","official_net":"45.00",
    "official_vat":"5.00","official_orders":1}'::jsonb,
  '[{"source_event_key":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "event_code":"REFUND","event_type":"refund","original_amount":"10.00",
    "removed_item_count":null,"source_operator":"operator12"}]'::jsonb,
  '[{"product_id":"1001","product_type":"combo",
    "description":"Synthetic meal","quantity":"1",
    "raw_value_not_revenue":"75.00","lines":1}]'::jsonb,
  '80000000-0000-4000-8000-000000000001', repeat('b',64)
);

select public.pos_stage_captiva_envelope(
  '01584','2026-09-02',repeat('a',64),
  '{"store_id":"01584","trading_date":"2026-09-02",
    "journal_filename":"jnl_02sep2026_01584_example.xml",
    "journal_coverage":"complete",
    "official_gross":"50.00","official_net":"45.00",
    "official_vat":"5.00","official_orders":1}'::jsonb,
  '[{"source_event_key":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "event_code":"REFUND","event_type":"refund","original_amount":"10.00",
    "removed_item_count":null,"source_operator":"operator12"}]'::jsonb,
  '[{"product_id":"1001","product_type":"combo",
    "description":"Synthetic meal","quantity":"1",
    "raw_value_not_revenue":"75.00","lines":1}]'::jsonb,
  '80000000-0000-4000-8000-000000000001', repeat('b',64)
);

-- Without a journal, stage financial snapshot, NOT synthetic zero refunds.
select public.pos_stage_captiva_envelope(
  '02137','2026-09-02',repeat('d',64),
  '{"store_id":"02137","trading_date":"2026-09-02",
    "journal_filename":null,"journal_coverage":"dashboard_only",
    "official_gross":"0.00","official_net":"0.00",
    "official_vat":"0.00","official_orders":0}'::jsonb,
  '[]'::jsonb,'[]'::jsonb,
  '80000000-0000-4000-8000-000000000002', repeat('e',64)
);

do $$
declare n int;
begin
  select count(*) into n from public.pos_exception_events
   where trading_date='2026-09-02';
  if n <> 1 then raise exception 'Event ingestion is not idempotent: %',n; end if;
  select count(*) into n from public.pos_captiva_product_observations;
  if n <> 1 then raise exception 'Product observation ingestion duplicated: %',n; end if;
  select count(*) into n from public.pos_captiva_ingest_receipts;
  if n <> 2 then raise exception 'Unexpected request count: %',n; end if;
  select count(*) into n from public.pos_captiva_daily_sources
  where trading_date='2026-09-02';
  if n <> 2 then raise exception 'Expected complete and dashboard-only snapshots'; end if;
  if (select raw_value_not_revenue from public.pos_captiva_product_observations) <> 75.00 then
    raise exception 'Raw product value changed while importing'; end if;
end;
$$;

do $$
begin
  begin
    select public.pos_stage_captiva_envelope(
      '01584','2026-09-02',repeat('a',64),
      '{"store_id":"01584","trading_date":"2026-09-02","journal_coverage":"dashboard_only",
        "official_gross":"0.00","official_net":"0.00",
        "official_vat":"0.00","official_orders":0}'::jsonb,
      '[]'::jsonb,'[]'::jsonb,
      '80000000-0000-4000-8000-000000000001',repeat('f',64));
    raise exception 'Expected duplicate request ID to fail';
  exception when others then
    if sqlerrm not like '%Reused request ID%' then raise; end if;
  end;
end;
$$;

do $$
begin
  begin
    select public.pos_stage_captiva_envelope(
      '02136','2026-09-02',repeat('f',64),
      '{"store_id":"02136","trading_date":"2026-09-02",
       "journal_coverage":"dashboard_only","journal_filename":null,
       "official_gross":"0.00","official_net":"0.00",
       "official_vat":"0.00","official_orders":0}'::jsonb,
      '[]'::jsonb,'[]'::jsonb,
      '80000000-0000-4000-8000-000000000003',repeat('f',64));
    raise exception 'Unbound Gourmet Pizza Factory should have been rejected';
  exception when others then
    if sqlerrm not like '%no active verified%' then raise; end if;
  end;
end;
$$;

do $$
begin
  begin
    update public.pos_captiva_product_observations
      set raw_value_not_revenue=1;
    raise exception 'Raw observation unexpectedly writable';
  exception when others then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
end;
$$;

reset role;

do $$
begin
  if has_function_privilege('authenticated',
     'public.pos_stage_captiva_envelope(text,date,text,jsonb,jsonb,jsonb,uuid,text)',
     'execute') then
    raise exception 'Authenticated users can run trusted ingestion RPC';
  end if;
  if has_function_privilege('anon',
     'public.pos_stage_captiva_envelope(text,date,text,jsonb,jsonb,jsonb,uuid,text)',
     'execute') then
    raise exception 'Anonymous users can run trusted ingestion RPC';
  end if;
end;
$$;

select 'PASS: Captiva staged ingestion, no revenue posting, replay-safe, store-bound' as result;
