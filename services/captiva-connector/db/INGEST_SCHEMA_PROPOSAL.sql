-- REVIEW-ONLY, NOT DEPLOYED: depends on EXCEPTION_REVIEW_SCHEMA_PROPOSAL.sql.
-- Captiva outbound staging never modifies sales or existing XLS imports.
-- Run only on ephemeral CI PostgreSQL until security and finance sign-off.

-- Explicit, administrator-maintained mapping. No guessing locations by name,
-- especially because Gourmet Pizza Factory's location has no restaurant_id.
create table if not exists public.pos_captiva_store_bindings (
    id uuid primary key default gen_random_uuid(),
    store_id text not null unique check (store_id ~ '^[0-9]{5}$'),
    restaurant_id uuid not null references public.restaurants(id),
    location_id uuid not null unique references public.locations(id),
    active boolean not null default false,
    created_at timestamptz not null default now()
);
create trigger pos_captiva_store_binding_tenant
  before insert or update on public.pos_captiva_store_bindings
  for each row execute function restaurantai_private.check_pos_location();
alter table public.pos_captiva_store_bindings enable row level security;
revoke all on public.pos_captiva_store_bindings from public, anon, authenticated;
grant all on public.pos_captiva_store_bindings to service_role;

-- Observed product/combination lines are not revenue.
create table if not exists public.pos_captiva_product_observations (
    id uuid primary key default gen_random_uuid(),
    source_id uuid not null,
    restaurant_id uuid not null references public.restaurants(id),
    location_id uuid not null references public.locations(id),
    trading_date date not null,
    product_id text not null check(length(product_id) between 1 and 100),
    product_type text not null check(length(product_type) between 1 and 50),
    description text not null default '',
    quantity numeric(16,3) not null,
    raw_value_not_revenue numeric(16,2) not null,
    lines integer not null check (lines > 0),
    created_at timestamptz not null default now(),
    foreign key(source_id,restaurant_id,location_id,trading_date)
      references public.pos_captiva_daily_sources(id,restaurant_id,location_id,trading_date),
    unique (source_id,product_id,product_type)
);
create index if not exists pos_captiva_product_observations_day
  on public.pos_captiva_product_observations(restaurant_id,location_id,trading_date);
create trigger pos_captiva_product_tenant
  before insert or update on public.pos_captiva_product_observations
  for each row execute function restaurantai_private.check_pos_location();
create trigger pos_captiva_product_immutable
  before update or delete on public.pos_captiva_product_observations
  for each row execute function restaurantai_private.deny_source_edit();
alter table public.pos_captiva_product_observations enable row level security;
revoke all on public.pos_captiva_product_observations from public,anon,authenticated;
grant select on public.pos_captiva_product_observations to authenticated;
grant all on public.pos_captiva_product_observations to service_role;
create policy pos_captiva_product_view
  on public.pos_captiva_product_observations for select to authenticated
  using (restaurantai_private.can_review_pos(restaurant_id,location_id,'view'));

-- Link each native event to the exact immutable journal version that
-- contained it. A corrected journal can remove an old event from the latest
-- report without destroying its original audit history or manager notes.
create table if not exists public.pos_captiva_event_sources (
    source_id uuid not null,
    event_id uuid not null,
    restaurant_id uuid not null references public.restaurants(id),
    location_id uuid not null references public.locations(id),
    trading_date date not null,
    created_at timestamptz not null default now(),
    primary key (source_id,event_id),
    foreign key (source_id,restaurant_id,location_id,trading_date)
      references public.pos_captiva_daily_sources(id,restaurant_id,location_id,trading_date),
    foreign key (event_id,restaurant_id,location_id)
      references public.pos_exception_events(id,restaurant_id,location_id)
);
create index if not exists pos_captiva_event_sources_event_idx
  on public.pos_captiva_event_sources(event_id);
create trigger pos_captiva_event_source_tenant
  before insert or update on public.pos_captiva_event_sources
  for each row execute function restaurantai_private.check_pos_location();
create trigger pos_captiva_event_source_immutable
  before update or delete on public.pos_captiva_event_sources
  for each row execute function restaurantai_private.deny_source_edit();
alter table public.pos_captiva_event_sources enable row level security;
revoke all on public.pos_captiva_event_sources from public,anon,authenticated;
grant select on public.pos_captiva_event_sources to authenticated;
grant all on public.pos_captiva_event_sources to service_role;
create policy pos_captiva_event_source_view
  on public.pos_captiva_event_sources for select to authenticated
  using (restaurantai_private.can_review_pos(restaurant_id,location_id,'view'));

-- Finance approval is append-only and separate from Captiva's immutable
-- source facts. An approval never changes sales, refunds, or XLS entries.
create table if not exists public.pos_captiva_daily_approvals (
    id uuid primary key default gen_random_uuid(),
    source_id uuid not null unique,
    restaurant_id uuid not null references public.restaurants(id),
    location_id uuid not null references public.locations(id),
    trading_date date not null,
    request_id uuid not null unique,
    approved_by uuid not null,
    payment_variance numeric(14,2) not null,
    evidence_reference text not null check (length(evidence_reference) between 5 and 160),
    approval_note text not null check (length(approval_note) between 15 and 4000),
    approved_at timestamptz not null default now(),
    foreign key (source_id,restaurant_id,location_id,trading_date)
      references public.pos_captiva_daily_sources(id,restaurant_id,location_id,trading_date)
);
create trigger pos_captiva_approval_tenant
  before insert or update on public.pos_captiva_daily_approvals
  for each row execute function restaurantai_private.check_pos_location();
create trigger pos_captiva_approval_immutable
  before update or delete on public.pos_captiva_daily_approvals
  for each row execute function restaurantai_private.deny_source_edit();
alter table public.pos_captiva_daily_approvals enable row level security;
revoke all on public.pos_captiva_daily_approvals from public,anon,authenticated;
grant select on public.pos_captiva_daily_approvals to authenticated;
grant all on public.pos_captiva_daily_approvals to service_role;
create policy pos_captiva_approval_manager_read
  on public.pos_captiva_daily_approvals for select to authenticated
  using (restaurantai_private.can_review_pos(restaurant_id,location_id,'edit'));

create or replace function public.pos_approve_captiva_daily_source(
    p_source_id uuid,
    p_approver_id uuid,
    p_request_id uuid,
    p_note text,
    p_evidence_reference text
) returns uuid
language plpgsql security invoker
set search_path = ''
as $source_approval$
declare
  v_source public.pos_captiva_daily_sources%rowtype;
  v_existing public.pos_captiva_daily_approvals%rowtype;
  v_id uuid;
begin
  if p_source_id is null or p_approver_id is null or p_request_id is null
    or length(trim(coalesce(p_note,''))) not between 15 and 4000
    or length(trim(coalesce(p_evidence_reference,''))) not between 5 and 160
  then raise exception 'Invalid day reconciliation approval'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_source_id::text,0)
  );
  select * into v_existing from public.pos_captiva_daily_approvals
    where source_id=p_source_id or request_id=p_request_id;
  if found then
    if v_existing.source_id=p_source_id
       and v_existing.request_id=p_request_id
       and v_existing.approved_by=p_approver_id
    then return v_existing.id; end if;
    raise exception 'Daily reconciliation already approved with another request';
  end if;
  select * into v_source from public.pos_captiva_daily_sources
    where id=p_source_id;
  if not found then raise exception 'Captiva source not found'; end if;
  if v_source.journal_coverage <> 'complete'
    or v_source.official_gross is null or v_source.official_net is null
    or v_source.official_vat is null or v_source.journal_standard_payments is null
    or abs(v_source.official_gross-v_source.official_net-v_source.official_vat)>0.02
  then raise exception 'Incomplete daily financial source cannot be approved'; end if;
  if exists (
    select 1 from public.pos_captiva_daily_sources newer
    where newer.restaurant_id=v_source.restaurant_id
      and newer.location_id=v_source.location_id
      and newer.trading_date=v_source.trading_date
      and (newer.observed_at,newer.id)>(v_source.observed_at,v_source.id)
  ) then raise exception 'Superseded daily source cannot be approved'; end if;

  insert into public.pos_captiva_daily_approvals (
    source_id,restaurant_id,location_id,trading_date,request_id,
    approved_by,payment_variance,evidence_reference,approval_note
  ) values (
    v_source.id,v_source.restaurant_id,v_source.location_id,v_source.trading_date,
    p_request_id,p_approver_id,
    v_source.journal_standard_payments-v_source.official_gross,
    trim(p_evidence_reference),trim(p_note)
  ) returning id into v_id;
  return v_id;
end;
$source_approval$;
revoke all on function public.pos_approve_captiva_daily_source(uuid,uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.pos_approve_captiva_daily_source(uuid,uuid,uuid,text,text)
  to service_role;

-- Override the draft sign-off guard: the source itself stays immutable, and
-- independently verified cashsheet approval is a separate append-only row.
-- Only current-version linked events block that day's sign-off.
create or replace function restaurantai_private.guard_pos_daily_signoff()
returns trigger
language plpgsql security invoker
set search_path = ''
as $latest_day_guard$
declare
  v_coverage text;
  v_unresolved bigint;
  v_pending bigint;
begin
  select d.journal_coverage into v_coverage
  from public.pos_captiva_daily_sources d
  where d.id=new.daily_source_id
    and d.restaurant_id=new.restaurant_id
    and d.location_id=new.location_id
    and d.trading_date=new.trading_date;
  if not found or v_coverage <> 'complete' then
    raise exception 'Day not eligible for sign-off: incomplete Captiva journal';
  end if;
  if not exists (
    select 1 from public.pos_captiva_daily_approvals a
    where a.source_id=new.daily_source_id
      and a.restaurant_id=new.restaurant_id
      and a.location_id=new.location_id
      and a.trading_date=new.trading_date
  ) then raise exception 'Day not eligible for sign-off: independent finance approval required';
  end if;
  if exists (
    select 1 from public.pos_captiva_daily_sources current_day
    join public.pos_captiva_daily_sources older on older.id=new.daily_source_id
    where current_day.restaurant_id=new.restaurant_id
      and current_day.location_id=new.location_id
      and current_day.trading_date=new.trading_date
      and (current_day.observed_at,current_day.id)>(older.observed_at,older.id)
  ) then raise exception 'Day not eligible for sign-off: superseded journal'; end if;

  select count(*) into v_unresolved
  from public.pos_captiva_event_sources link
  left join public.pos_exception_reviews r on r.event_id=link.event_id
  where link.source_id=new.daily_source_id
    and coalesce(r.review_status,'open')<>'resolved';
  if v_unresolved<>0 then
    raise exception 'Day not eligible for sign-off: unresolved exceptions';
  end if;
  select count(*) into v_pending
  from public.pos_recovery_claims c
  join public.pos_captiva_event_sources link on link.event_id=c.event_id
  where link.source_id=new.daily_source_id
    and c.status='pending_verification';
  if v_pending<>0 then
    raise exception 'Day not eligible for sign-off: unverified recovered payments';
  end if;
  return new;
end;
$latest_day_guard$;

create or replace function public.pos_signoff_captiva_day(
    p_source_id uuid,
    p_signer_id uuid,
    p_request_id uuid,
    p_note text
) returns uuid
language plpgsql security invoker
set search_path = ''
as $captiva_signoff$
declare
  v_source public.pos_captiva_daily_sources%rowtype;
  v_existing public.pos_exception_daily_signoffs%rowtype;
  v_id uuid;
begin
  if p_source_id is null or p_signer_id is null or p_request_id is null
    or length(trim(coalesce(p_note,''))) not between 10 and 4000
  then raise exception 'Invalid daily sign-off'; end if;
  select * into v_source from public.pos_captiva_daily_sources where id=p_source_id;
  if not found then raise exception 'Daily source not found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_source.location_id::text||v_source.trading_date::text,0)
  );
  select * into v_existing from public.pos_exception_daily_signoffs
  where restaurant_id=v_source.restaurant_id
    and location_id=v_source.location_id
    and trading_date=v_source.trading_date;
  if found then
    if v_existing.daily_source_id=p_source_id
      and v_existing.request_id=p_request_id
      and v_existing.signed_by=p_signer_id
    then return v_existing.id; end if;
    raise exception 'Day is already signed off'; end if;

  insert into public.pos_exception_daily_signoffs (
    restaurant_id,location_id,trading_date,daily_source_id,
    signed_by,request_id,manager_note
  ) values (
    v_source.restaurant_id,v_source.location_id,v_source.trading_date,
    v_source.id,p_signer_id,p_request_id,trim(p_note)
  ) returning id into v_id;
  return v_id;
end;
$captiva_signoff$;
revoke all on function public.pos_signoff_captiva_day(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.pos_signoff_captiva_day(uuid,uuid,uuid,text)
  to service_role;

-- Idempotent submission log (contains hashes but never credentials or XML).
create table if not exists public.pos_captiva_ingest_receipts (
    request_id uuid primary key,
    store_id text not null,
    trading_date date not null,
    payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
    source_id uuid not null references public.pos_captiva_daily_sources(id),
    accepted_at timestamptz not null default now()
);
alter table public.pos_captiva_ingest_receipts enable row level security;
revoke all on public.pos_captiva_ingest_receipts from public,anon,authenticated;
grant all on public.pos_captiva_ingest_receipts to service_role;
create trigger pos_captiva_ingest_receipts_immutable
  before update or delete on public.pos_captiva_ingest_receipts
  for each row execute function restaurantai_private.deny_source_edit();

-- Atomic backend-only ingestion. An authenticated user cannot call it directly.
-- This function stages only immutable Captiva evidence. It NEVER updates sales,
-- POS import staging, mapped dishes, daily ledgers, or revenue adjustments.
create or replace function public.pos_stage_captiva_envelope(
    p_store_id text,
    p_trade_date date,
    p_source_fingerprint text,
    p_snapshot jsonb,
    p_events jsonb,
    p_products jsonb,
    p_request_id uuid,
    p_payload_hash text
) returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
    v_binding public.pos_captiva_store_bindings%rowtype;
    v_source_id uuid;
    v_receipt public.pos_captiva_ingest_receipts%rowtype;
    v_gross numeric;
    v_net numeric;
    v_vat numeric;
    v_orders integer;
    v_coverage text;
    v_filename text;
    v_standard_payments numeric;
    v_refund_payments numeric;
    v_other_payments numeric;
    v_payment_records integer;
    v_event jsonb;
    v_product jsonb;
    v_source_event_key text;
    v_amount numeric;
    v_existing_event public.pos_exception_events%rowtype;
    v_count integer := 0;
    v_products integer := 0;
    v_code text;
    v_type text;
begin
    if p_request_id is null or p_trade_date is null or p_snapshot is null
      or p_store_id !~ '^[0-9]{5}$'
      or p_source_fingerprint !~ '^[0-9a-f]{64}$'
      or p_payload_hash !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(p_snapshot) <> 'object'
      or jsonb_typeof(p_events) <> 'array'
      or jsonb_typeof(p_products) <> 'array'
      or jsonb_array_length(p_events) > 2000
      or jsonb_array_length(p_products) > 2000
      or p_snapshot->>'store_id' is distinct from p_store_id
      or p_snapshot->>'trading_date' is distinct from p_trade_date::text
    then raise exception 'Invalid Captiva staging envelope'; end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_request_id::text, 0)
    );
    select * into v_receipt from public.pos_captiva_ingest_receipts
      where request_id=p_request_id;
    if found then
      if v_receipt.payload_hash <> p_payload_hash or v_receipt.store_id <> p_store_id
        or v_receipt.trading_date <> p_trade_date then
        raise exception 'Reused request ID with different staging contents';
      end if;
      return pg_catalog.jsonb_build_object(
         'status','already_staged','source_id',v_receipt.source_id,
         'revenue_changed',false);
    end if;

    select * into v_binding from public.pos_captiva_store_bindings
      where store_id=p_store_id and active is true;
    if not found then raise exception 'Captiva store has no active verified location binding'; end if;

    if exists (
      select 1 from public.pos_exception_daily_signoffs
      where restaurant_id=v_binding.restaurant_id
        and location_id=v_binding.location_id
        and trading_date=p_trade_date
    ) then raise exception 'Signed-off trading day cannot be restaged'; end if;

    v_coverage := p_snapshot->>'journal_coverage';
    if v_coverage not in ('complete','dashboard_only') then
      raise exception 'Journal coverage not eligible for staging';
    end if;
    v_filename := p_snapshot->>'journal_filename';
    if v_coverage='complete' then
      if v_filename is null
         or v_filename !~ '^[a-zA-Z0-9_.-]{8,255}[.]xml$'
      then raise exception 'Complete journal needs a safe native filename'; end if;
    else
      if v_filename is not null
        or jsonb_array_length(p_events) <> 0
        or jsonb_array_length(p_products) <> 0
      then raise exception 'Missing journal cannot claim products or exception data'; end if;
    end if;

    v_standard_payments := (p_snapshot->>'journal_standard_payments')::numeric;
    v_refund_payments := (p_snapshot->>'journal_refund_payments')::numeric;
    v_other_payments := (p_snapshot->>'journal_other_payments')::numeric;
    v_payment_records := (p_snapshot->>'journal_payment_records')::integer;
    if v_coverage='complete' and (
      v_standard_payments is null or v_refund_payments is null
      or v_other_payments is null or v_payment_records is null
      or v_payment_records < 0 or v_payment_records > 100000
      or greatest(abs(v_standard_payments),abs(v_refund_payments),
                  abs(v_other_payments)) > 10000000
    ) then raise exception 'Complete journal must include payment diagnostics'; end if;
    if v_coverage='dashboard_only' and (
      v_standard_payments is not null or v_refund_payments is not null
      or v_other_payments is not null or v_payment_records is not null
    ) then raise exception 'Missing journal must not fabricate payment totals'; end if;

    v_gross := (p_snapshot->>'official_gross')::numeric;
    v_net := (p_snapshot->>'official_net')::numeric;
    v_vat := (p_snapshot->>'official_vat')::numeric;
    v_orders := (p_snapshot->>'official_orders')::integer;
    if v_gross is null or v_net is null or v_vat is null or v_orders is null
      or least(v_gross,v_net,v_vat) < 0 or v_orders < 0
      or abs(v_gross-v_net-v_vat) > 0.02 then
      raise exception 'Captiva official dashboard fields do not reconcile'; end if;

    insert into public.pos_captiva_daily_sources (
      restaurant_id,location_id,store_id,trading_date,
      official_gross,official_net,official_vat,official_orders,
      journal_standard_payments,journal_refund_payments,
      journal_other_payments,journal_payment_records,
      journal_coverage,reconciliation_state,source_fingerprint
    ) values (
      v_binding.restaurant_id,v_binding.location_id,p_store_id,p_trade_date,
      v_gross,v_net,v_vat,v_orders,
      v_standard_payments,v_refund_payments,v_other_payments,v_payment_records,
      v_coverage,'unverified',p_source_fingerprint
    )
    on conflict (restaurant_id,location_id,store_id,trading_date,source_fingerprint)
    do nothing
    returning id into v_source_id;
    if v_source_id is null then
      select id into v_source_id from public.pos_captiva_daily_sources
      where restaurant_id=v_binding.restaurant_id
        and location_id=v_binding.location_id
        and store_id=p_store_id and trading_date=p_trade_date
        and source_fingerprint=p_source_fingerprint;
    end if;
    if v_source_id is null then raise exception 'Failed to resolve staged source'; end if;

    for v_event in select value from pg_catalog.jsonb_array_elements(p_events)
    loop
      v_source_event_key := v_event->>'source_event_key';
      v_code := v_event->>'event_code';
      v_type := v_event->>'event_type';
      if jsonb_typeof(v_event) <> 'object'
        or v_source_event_key !~ '^[0-9a-f]{64}$'
        or length(coalesce(v_code,'')) not between 1 and 80
        or v_type not in ('refund','removed_items','service_charge_deleted',
                          'possible_void','possible_cancellation')
      then raise exception 'Invalid native exception event'; end if;
      v_amount := nullif(v_event->>'original_amount','')::numeric;
      if v_amount is not null and abs(v_amount) > 10000000 then
        raise exception 'Exception amount exceeds allowed bounds'; end if;
      insert into public.pos_exception_events(
        restaurant_id,location_id,store_id,trading_date,
        journal_filename,source_event_key,event_code,event_type,
        original_amount,removed_item_count,source_operator,
        source_date_text,source_time_text
      ) values (
        v_binding.restaurant_id,v_binding.location_id,p_store_id,p_trade_date,
        v_filename,v_source_event_key,v_code,v_type,
        v_amount,(v_event->>'removed_item_count')::integer,
        left(nullif(v_event->>'source_operator',''),80),
        left(nullif(v_event->>'source_date_text',''),50),
        left(nullif(v_event->>'source_time_text',''),50)
      ) on conflict (restaurant_id,location_id,source_event_key) do nothing;
      select * into v_existing_event
        from public.pos_exception_events
        where restaurant_id=v_binding.restaurant_id
          and location_id=v_binding.location_id
          and source_event_key=v_source_event_key;
      if v_existing_event.event_code is distinct from v_code
          or v_existing_event.event_type is distinct from v_type
          or v_existing_event.original_amount is distinct from v_amount
          or v_existing_event.journal_filename is distinct from v_filename
          or v_existing_event.trading_date is distinct from p_trade_date
          or v_existing_event.source_operator is distinct from left(nullif(v_event->>'source_operator',''),80)
          or v_existing_event.source_date_text is distinct from left(nullif(v_event->>'source_date_text',''),50)
          or v_existing_event.source_time_text is distinct from left(nullif(v_event->>'source_time_text',''),50)
          or v_existing_event.removed_item_count is distinct from (v_event->>'removed_item_count')::integer then
        raise exception 'POS event fingerprint collision with different contents';
      end if;
      insert into public.pos_captiva_event_sources (
        source_id,event_id,restaurant_id,location_id,trading_date
      ) values (
        v_source_id,v_existing_event.id,
        v_binding.restaurant_id,v_binding.location_id,p_trade_date
      ) on conflict (source_id,event_id) do nothing;
      v_count := v_count+1;
    end loop;

    for v_product in select value from pg_catalog.jsonb_array_elements(p_products)
    loop
      if jsonb_typeof(v_product) <> 'object'
        or coalesce(v_product->>'product_id','') !~ '^[a-zA-Z0-9_.:-]{1,100}$'
        or length(coalesce(v_product->>'product_type','')) not between 1 and 50
        or (v_product->>'lines')::int not between 1 and 10000
      then raise exception 'Invalid Captiva product observation'; end if;
      insert into public.pos_captiva_product_observations(
        source_id,restaurant_id,location_id,trading_date,
        product_id,product_type,description,quantity,raw_value_not_revenue,lines
      ) values (
        v_source_id,v_binding.restaurant_id,v_binding.location_id,p_trade_date,
        v_product->>'product_id',v_product->>'product_type',
        left(coalesce(v_product->>'description',''),150),
        (v_product->>'quantity')::numeric,(v_product->>'raw_value_not_revenue')::numeric,
        (v_product->>'lines')::int
      ) on conflict (source_id,product_id,product_type) do nothing;
      v_products := v_products+1;
    end loop;

    insert into public.pos_captiva_ingest_receipts(
      request_id,store_id,trading_date,payload_hash,source_id
    ) values (p_request_id,p_store_id,p_trade_date,p_payload_hash,v_source_id);

    return pg_catalog.jsonb_build_object(
      'status','staged','source_id',v_source_id,
      'events_received',v_count,'product_observations_received',v_products,
      'journal_coverage',v_coverage,'reconciled',false,
      'revenue_changed',false
    );
end;
$$;
revoke all on function public.pos_stage_captiva_envelope(
    text,date,text,jsonb,jsonb,jsonb,uuid,text)
  from public,anon,authenticated;
grant execute on function public.pos_stage_captiva_envelope(
    text,date,text,jsonb,jsonb,jsonb,uuid,text)
  to service_role;

-- DO NOT enable staging or create store bindings in production until approved.
