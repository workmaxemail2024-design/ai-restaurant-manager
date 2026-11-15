-- PostgreSQL-only synthetic smoke test (never uses production data).
-- Run after applying tests/sql_stub_schema.sql and schema proposal.

insert into public.restaurants(id)
values ('10000000-0000-4000-8000-000000000001'),
       ('10000000-0000-4000-8000-000000000002');

insert into public.locations(id,restaurant_id)
values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
       ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');

insert into public.roles(id,restaurant_id,permissions)
values ('30000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '{"pos":{"view":true,"edit":true}}');

insert into public.user_restaurants(user_id,restaurant_id,role_id,is_active)
values ('40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',true);

insert into public.user_location_access(user_id,restaurant_id,location_id)
values ('40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001');

insert into public.pos_captiva_daily_sources (
  id,restaurant_id,location_id,store_id,trading_date,
  official_gross,official_orders,journal_coverage,source_fingerprint
) values (
  '50000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '01584','2026-09-01',2398.45,28,'complete',
  'sha256:0123456789abcdef0123456789abcdef'
);

insert into public.pos_exception_events(
  id,restaurant_id,location_id,store_id,trading_date,
  journal_filename,source_event_key,event_code,event_type,original_amount
) values (
  '60000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '01584','2026-09-01','jnl_01sep2026_01584_041130_1_00002237.xml',
  'sha256:0123456789abcdef0123456789abcdef','REFUND','refund',420.60
);

do $$
declare total int;
begin
  select count(*) into total from public.pos_exception_events;
  if total <> 1 then raise exception 'Expected one test event'; end if;
end;
$$;

-- A user with an ACTIVE membership, matching restaurant role and an explicit
-- location grant may view only their authorised restaurant.
set role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',false);
do $$
declare total int;
begin
  select count(*) into total from public.pos_exception_events;
  if total <> 1 then raise exception 'Allowed manager cannot view own event: %', total; end if;
end;
$$;

-- Another authenticated user without a membership sees no events.
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000002',false);
do $$
declare total int;
begin
  select count(*) into total from public.pos_exception_events;
  if total <> 0 then raise exception 'Cross-tenant event exposure detected'; end if;
end;
$$;
reset role;

-- Transactional review RPC must be idempotent; duplicate request ID may not
-- create two audit entries or roll a review back to an older state.
set role service_role;
select public.pos_record_exception_review(
 '60000000-0000-4000-8000-000000000001',
 '40000000-0000-4000-8000-000000000001',
 '70000000-0000-4000-8000-000000000001',
 'reviewing','pending','Manager investigating'
);
select public.pos_record_exception_review(
 '60000000-0000-4000-8000-000000000001',
 '40000000-0000-4000-8000-000000000001',
 '70000000-0000-4000-8000-000000000001',
 'reviewing','pending','Manager investigating'
);

select public.pos_claim_recovered_payment(
 '60000000-0000-4000-8000-000000000001',
 '40000000-0000-4000-8000-000000000001',
 '70000000-0000-4000-8000-000000000002',
 45.00,'cash','TEST-PAY-0001'
);
select public.pos_claim_recovered_payment(
 '60000000-0000-4000-8000-000000000001',
 '40000000-0000-4000-8000-000000000001',
 '70000000-0000-4000-8000-000000000002',
 45.00,'cash','TEST-PAY-0001'
);
reset role;

do $$
declare total int;
begin
  select count(*) into total from public.pos_exception_reviews;
  if total <> 1 then raise exception 'Review not idempotent'; end if;
  select count(*) into total from public.pos_exception_review_audit;
  if total <> 2 then raise exception 'Audit should contain one review and one recovery: %',total; end if;
  select count(*) into total from public.pos_recovery_claims
  where status = 'pending_verification' and verified_at is null;
  if total <> 1 then raise exception 'Recovery claim not idempotent and pending'; end if;
  if has_function_privilege('authenticated',
       'public.pos_record_exception_review(uuid,uuid,uuid,text,text,text)',
       'execute') then
    raise exception 'Authenticated role may directly run review RPC';
  end if;
  if has_function_privilege('anon',
       'public.pos_record_exception_review(uuid,uuid,uuid,text,text,text)',
       'execute') then
    raise exception 'Anonymous role may directly run review RPC';
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in (
        'pos_captiva_daily_sources','pos_exception_events','pos_exception_reviews',
        'pos_exception_review_audit','pos_recovery_claims','pos_exception_daily_signoffs'
      ) and c.relrowsecurity) <> 6 then
    raise exception 'RLS not enabled on all six new tables';
  end if;
end;
$$;

do $$
begin
  begin
    update public.pos_exception_events set event_code='MODIFIED'
    where id='60000000-0000-4000-8000-000000000001';
    raise exception 'Expected immutable event trigger error';
  exception
    when others then
      if sqlerrm not like '%append-only%' then raise; end if;
  end;
end;
$$;

do $$
begin
  begin
    insert into public.pos_exception_events (
      restaurant_id,location_id,store_id,trading_date,
      journal_filename,source_event_key,event_code,event_type
    ) values (
      '10000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000001',
      '01584','2026-09-01','jnl_01sep2026_01584_041130_1_00002237.xml',
      'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','REFUND','refund'
    );
    raise exception 'Expected tenant mismatch error';
  exception
    when others then
      if sqlerrm not like '%tenant/location mismatch%' then raise; end if;
  end;
end;
$$;

-- A user with only POS VIEW rights can see the source event but NOT
-- sensitive manager notes, review audit history or recovered payment claims.
insert into public.roles(id,restaurant_id,permissions)
values ('30000000-0000-4000-8000-000000000003',
        '10000000-0000-4000-8000-000000000001',
        '{"pos":{"view":true}}');

insert into public.user_restaurants(user_id,restaurant_id,role_id,is_active)
values ('40000000-0000-4000-8000-000000000003',
        '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000003',true);

insert into public.user_location_access(user_id,restaurant_id,location_id)
values ('40000000-0000-4000-8000-000000000003',
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001');

set role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000003',false);
do $$
declare cnt int;
begin
  select count(*) into cnt from public.pos_exception_events;
  if cnt <> 1 then raise exception 'POS viewer cannot see their permitted event'; end if;
  select count(*) into cnt from public.pos_exception_reviews;
  if cnt <> 0 then raise exception 'POS viewer can access private manager notes'; end if;
  select count(*) into cnt from public.pos_exception_review_audit;
  if cnt <> 0 then raise exception 'POS viewer can access review audit'; end if;
  select count(*) into cnt from public.pos_recovery_claims;
  if cnt <> 0 then raise exception 'POS viewer can access private recovery details'; end if;
end;
$$;
reset role;

-- Safeguard: daily sign-off cannot be created on a dashboard-only or
-- unreconciled source. A fully complete and verified source is still blocked
-- while there are unresolved POS exceptions.
set role service_role;
do $$
begin
  begin
    insert into public.pos_exception_daily_signoffs (
      restaurant_id,location_id,trading_date,daily_source_id,signed_by
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '2026-09-01',
      '50000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001'
    );
    raise exception 'Unverified source sign-off should have failed';
  exception when others then
    if sqlerrm not like '%source incomplete or unverified%' then raise; end if;
  end;
end;
$$;
reset role;

insert into public.pos_captiva_daily_sources (
  id,restaurant_id,location_id,store_id,trading_date,official_gross,
  official_orders,journal_coverage,reconciliation_state,source_fingerprint
) values (
  '50000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '01584','2026-09-01',2398.45,28,'complete','verified',
  'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
);

set role service_role;
do $$
begin
  begin
    insert into public.pos_exception_daily_signoffs (
      restaurant_id,location_id,trading_date,daily_source_id,signed_by
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '2026-09-01',
      '50000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000001'
    );
    raise exception 'Unresolved-event sign-off should have failed';
  exception when others then
    if sqlerrm not like '%unresolved exceptions%' then raise; end if;
  end;
end;
$$;
select public.pos_record_exception_review(
 '60000000-0000-4000-8000-000000000001',
 '40000000-0000-4000-8000-000000000001',
 '70000000-0000-4000-8000-000000000003',
 'resolved','confirmed_unpaid','Reviewed and confirmed unpaid with duty manager'
);
insert into public.pos_exception_daily_signoffs (
  restaurant_id,location_id,trading_date,daily_source_id,signed_by
) values (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-09-01',
  '50000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000001'
);
reset role;
do $$
begin
  if (select count(*) from public.pos_exception_daily_signoffs) <> 1 then
    raise exception 'Expected exactly one verified signed-off day';
  end if;
end;
$$;

select 'PASS: POS exception RLS, transactional audit, recovery and immutability' as result;
