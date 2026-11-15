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
    "official_vat":"5.00","official_orders":1,
    "journal_standard_payments":"50.00","journal_refund_payments":"10.00",
    "journal_other_payments":"0.00","journal_payment_records":2}'::jsonb,
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
    "official_vat":"5.00","official_orders":1,
    "journal_standard_payments":"50.00","journal_refund_payments":"10.00",
    "journal_other_payments":"0.00","journal_payment_records":2}'::jsonb,
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
    "official_vat":"0.00","official_orders":0,
    "journal_standard_payments":null,"journal_refund_payments":null,
    "journal_other_payments":null,"journal_payment_records":null}'::jsonb,
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
  if (select journal_refund_payments from public.pos_captiva_daily_sources
      where trading_date='2026-09-02' and store_id='01584') <> 10.00 then
    raise exception 'Refund audit diagnostics missing'; end if;
  if (select official_gross from public.pos_captiva_daily_sources
      where trading_date='2026-09-02' and store_id='01584') <> 50.00 then
    raise exception 'Refund was incorrectly deducted from official gross'; end if;
  if (select journal_standard_payments from public.pos_captiva_daily_sources
      where trading_date='2026-09-02' and store_id='02137') is not null then
    raise exception 'Dashboard-only day should have unknown payment totals'; end if;
end;
$$;

do $$
begin
  begin
    select public.pos_stage_captiva_envelope(
      '01584','2026-09-02',repeat('a',64),
      '{"store_id":"01584","trading_date":"2026-09-02","journal_coverage":"dashboard_only",
        "official_gross":"0.00","official_net":"0.00",
        "official_vat":"0.00","official_orders":0,
    "journal_standard_payments":null,"journal_refund_payments":null,
    "journal_other_payments":null,"journal_payment_records":null}'::jsonb,
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
       "official_vat":"0.00","official_orders":0,
    "journal_standard_payments":null,"journal_refund_payments":null,
    "journal_other_payments":null,"journal_payment_records":null}'::jsonb,
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

-- A corrected journal version deliberately excludes an earlier refund.
-- The original immutable event remains in audit history, but the latest
-- source's event links exclude that now-stale event.
select public.pos_stage_captiva_envelope(
  '01584','2026-09-02',repeat('f',64),
  '{"store_id":"01584","trading_date":"2026-09-02",
    "journal_filename":"jnl_02sep2026_01584_example.xml",
    "journal_coverage":"complete",
    "official_gross":"50.00","official_net":"45.00",
    "official_vat":"5.00","official_orders":1,
    "journal_standard_payments":"50.00","journal_refund_payments":"0.00",
    "journal_other_payments":"0.00","journal_payment_records":1}'::jsonb,
  '[]'::jsonb,'[]'::jsonb,
  '80000000-0000-4000-8000-000000000004',repeat('1',64)
);
do $source_version_test$
declare
  v_original_id uuid;
  v_new_id uuid;
  v_count integer;
begin
  select id into v_original_id from public.pos_captiva_daily_sources
  where store_id='01584' and trading_date='2026-09-02'
    and source_fingerprint=repeat('a',64);
  select id into v_new_id from public.pos_captiva_daily_sources
  where store_id='01584' and trading_date='2026-09-02'
    and source_fingerprint=repeat('f',64);
  select count(*) into v_count from public.pos_captiva_event_sources
    where source_id=v_original_id;
  if v_count<>1 then raise exception 'Missing original immutable event-to-source link'; end if;
  select count(*) into v_count from public.pos_captiva_event_sources
    where source_id=v_new_id;
  if v_count<>0 then raise exception 'Corrected journal incorrectly contains historical refund'; end if;
  select count(*) into v_count from public.pos_exception_events
    where trading_date='2026-09-02';
  if v_count<>1 then raise exception 'Old audit event unexpectedly removed'; end if;
end;
$source_version_test$;

-- Daily finance approval is separate from immutable source facts.
-- No sign-off is allowed until current source has an approval record.
do $approval_smoke$
declare
  v_old_id uuid;
  v_new_id uuid;
  v_gourmet_source_id uuid;
  v_first uuid;
  v_repeat uuid;
  v_signoff uuid;
begin
  select id into v_old_id from public.pos_captiva_daily_sources
    where store_id='01584' and trading_date='2026-09-02'
      and source_fingerprint=repeat('a',64);
  select id into v_new_id from public.pos_captiva_daily_sources
    where store_id='01584' and trading_date='2026-09-02'
      and source_fingerprint=repeat('f',64);
  select id into v_gourmet_source_id from public.pos_captiva_daily_sources
    where store_id='02137' and trading_date='2026-09-02';

  begin
    perform public.pos_approve_captiva_daily_source(
      v_old_id,'40000000-0000-4000-8000-000000000002',
      '80000000-0000-4000-8000-000000000005',
      'Signed sheet reconciles the older version','SHEET-OLDER');
    raise exception 'Expected stale journal approval to fail';
  exception when others then
    if sqlerrm not like '%Superseded daily source%' then raise; end if;
  end;
  begin
    perform public.pos_approve_captiva_daily_source(
      v_gourmet_source_id,'40000000-0000-4000-8000-000000000002',
      '80000000-0000-4000-8000-000000000006',
      'Dashboard only records are not verified','SHEET-MISSING');
    raise exception 'Expected dashboard-only approval to fail';
  exception when others then
    if sqlerrm not like '%Incomplete daily financial source%' then raise; end if;
  end;

  begin
    perform public.pos_signoff_captiva_day(
      v_new_id,'40000000-0000-4000-8000-000000000002',
      '80000000-0000-4000-8000-000000000007',
      'Closing shift after review');
    raise exception 'Expected sign-off before finance approval to fail';
  exception when others then
    if sqlerrm not like '%independent finance approval required%' then raise; end if;
  end;

  v_first := public.pos_approve_captiva_daily_source(
    v_new_id,'40000000-0000-4000-8000-000000000002',
    '80000000-0000-4000-8000-000000000008',
    'Crosschecked standard payments, gross, net, VAT and prior refund amendment',
    'TILL-SHEET-2026-09-02');
  v_repeat := public.pos_approve_captiva_daily_source(
    v_new_id,'40000000-0000-4000-8000-000000000002',
    '80000000-0000-4000-8000-000000000008',
    'Crosschecked standard payments, gross, net, VAT and prior refund amendment',
    'TILL-SHEET-2026-09-02');
  if v_first is null or v_first<>v_repeat then
    raise exception 'Finance approval request was not idempotent';
  end if;
  if (select reconciliation_state from public.pos_captiva_daily_sources
      where id=v_new_id)<>'unverified' then
    raise exception 'Original immutable source was modified by finance approval';
  end if;
  v_signoff := public.pos_signoff_captiva_day(
    v_new_id,'40000000-0000-4000-8000-000000000002',
    '80000000-0000-4000-8000-000000000009',
    'Current journal version reviewed and closed');
  if v_signoff is null or v_signoff<>public.pos_signoff_captiva_day(
    v_new_id,'40000000-0000-4000-8000-000000000002',
    '80000000-0000-4000-8000-000000000009',
    'Current journal version reviewed and closed') then
    raise exception 'Day close-out request was not idempotent';
  end if;
  if (select count(*) from public.pos_exception_events
    where trading_date='2026-09-02')<>1 then
    raise exception 'Original source event lost during corrected-journal signoff';
  end if;
end;
$approval_smoke$;

reset role;

do $permissions_test$
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
  if has_function_privilege('authenticated',
    'public.pos_approve_captiva_daily_source(uuid,uuid,uuid,text,text)',
    'execute') then raise exception 'End user can directly approve financial day'; end if;
  if has_function_privilege('authenticated',
    'public.pos_signoff_captiva_day(uuid,uuid,uuid,text)',
    'execute') then raise exception 'End user can directly sign off financial day'; end if;
end;
$permissions_test$;

select 'PASS: Captiva staged ingestion, no revenue posting, replay-safe, store-bound' as result;
