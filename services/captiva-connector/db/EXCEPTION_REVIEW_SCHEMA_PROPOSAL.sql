-- RestaurantAI Captiva exception-review backend — REVIEW-ONLY SQL
-- Intentionally not a Supabase migration yet. This is NOT deployed.
-- Apply via an approved, generated migration after isolated tests and review.
-- Does not modify sales, pos_sales_import, external_pos_items or daily_ledger_entries.
-- Supabase project uses public.restaurants, locations, user_restaurants, roles, user_location_access.

create schema if not exists restaurantai_private;
revoke all on schema restaurantai_private from public;
grant usage on schema restaurantai_private to authenticated, service_role;

-- Per-restaurant and per-location permission check. Not callable through the
-- public Data API. Use membership's own role, NOT the user's default role in
-- another restaurant. This function returns false for unauthenticated users.
create or replace function restaurantai_private.can_review_pos(
    p_restaurant_id uuid,
    p_location_id uuid,
    p_action text default 'view'
) returns boolean
language sql stable security definer
set search_path = ''
as $$
    select (select auth.uid()) is not null
       and exists (
          select 1
          from public.user_restaurants ur
          join public.roles r
            on r.id = ur.role_id and r.restaurant_id = ur.restaurant_id
          join public.locations l
            on l.id = p_location_id and l.restaurant_id = p_restaurant_id
          where ur.user_id = (select auth.uid())
            and ur.restaurant_id = p_restaurant_id
            and ur.is_active
            and (
              r.permissions @> '{"full_access": true}'::jsonb
              or exists (
                select 1 from public.user_location_access ula
                where ula.user_id = ur.user_id
                  and ula.restaurant_id = p_restaurant_id
                  and ula.location_id = p_location_id
              )
            )
            and (
              r.permissions @> '{"full_access": true}'::jsonb
              or (
                p_action in ('view','edit','admin')
                and (
                  (r.permissions -> 'pos') @> '{"admin":true}'::jsonb
                  or (p_action in ('view','edit')
                      and (r.permissions -> 'pos') @> '{"edit":true}'::jsonb)
                  or (p_action = 'view'
                      and (r.permissions -> 'pos') @> '{"view":true}'::jsonb)
                )
              )
            )
       );
$$;
revoke all on function restaurantai_private.can_review_pos(uuid,uuid,text) from public, anon;
grant execute on function restaurantai_private.can_review_pos(uuid,uuid,text) to authenticated, service_role;

create or replace function restaurantai_private.check_pos_location()
returns trigger
language plpgsql security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.locations l
    where l.id = new.location_id
      and l.restaurant_id = new.restaurant_id
  ) then
    raise exception 'POS tenant/location mismatch';
  end if;
  return new;
end;
$$;

-- Preserve immutable POS-source evidence, even if a service role application
-- accidentally attempts an UPDATE or DELETE. New versions are new observations.
create or replace function restaurantai_private.deny_source_edit()
returns trigger
language plpgsql security invoker
set search_path = ''
as $$
begin
  raise exception 'Captiva source records are append-only';
end;
$$;

-- Official Captiva dashboard data: never back-calculate from raw XML products.
create table if not exists public.pos_captiva_daily_sources (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id),
    location_id uuid not null references public.locations(id),
    store_id text not null check (length(store_id) between 1 and 20),
    trading_date date not null,
    official_gross numeric(14,2),
    official_net numeric(14,2),
    official_vat numeric(14,2),
    official_orders integer check (official_orders is null or official_orders >= 0),
    journal_standard_payments numeric(14,2),
    journal_refund_payments numeric(14,2),
    journal_other_payments numeric(14,2),
    journal_payment_records integer check (journal_payment_records is null or journal_payment_records >= 0),
    journal_coverage text not null check (journal_coverage in
        ('complete','dashboard_only','pending','error')),
    reconciliation_state text not null default 'unverified' check (
        reconciliation_state in ('unverified','verified','discrepancy')),
    source_fingerprint text not null check (length(source_fingerprint) between 32 and 128),
    observed_at timestamptz not null default now(),
    unique (id,restaurant_id,location_id,trading_date),
    unique (restaurant_id,location_id,store_id,trading_date,source_fingerprint)
);
create index if not exists pos_captiva_sources_day_idx
  on public.pos_captiva_daily_sources (restaurant_id,location_id,trading_date desc,observed_at desc);

-- One immutable audit event per verified native POS event.
-- source_event_key MUST come from a stable journal+order+event ID fingerprint;
-- local XML array positions are not valid production identities.
create table if not exists public.pos_exception_events (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id),
    location_id uuid not null references public.locations(id),
    store_id text not null,
    trading_date date not null,
    journal_filename text not null check (length(journal_filename) between 8 and 255),
    source_event_key text not null check (length(source_event_key) between 32 and 128),
    event_code text not null check (length(event_code) between 1 and 80),
    event_type text not null default 'unclassified' check (event_type in
       ('refund','removed_items','service_charge_deleted','possible_void',
        'possible_cancellation','discount','unclassified')),
    event_occurred_at timestamptz,
    source_operator text,
    source_date_text text,
    source_time_text text,
    original_amount numeric(14,2),
    removed_item_count integer check (removed_item_count is null or removed_item_count >= 0),
    created_at timestamptz not null default now(),
    unique (id,restaurant_id,location_id),
    unique (restaurant_id,location_id,source_event_key)
);
create index if not exists pos_exception_events_day_idx
  on public.pos_exception_events (restaurant_id,location_id,trading_date desc,event_type);

-- One mutable review state per immutable event, via server-only RPC.
create table if not exists public.pos_exception_reviews (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null unique,
    restaurant_id uuid not null references public.restaurants(id),
    location_id uuid not null references public.locations(id),
    review_status text not null default 'open' check
       (review_status in ('open','reviewing','resolved','reopened')),
    resolution text not null default 'pending' check
       (resolution in ('pending','paid_in_pos','paid_outside_pos_pending',
        'recovery_verified','confirmed_unpaid','legitimate_cancellation','invalid_event')),
    last_note text,
    reviewed_by uuid,
    reviewed_at timestamptz,
    updated_at timestamptz not null default now(),
    constraint pos_exception_reviews_event_tenant_fk
       foreign key (event_id,restaurant_id,location_id)
       references public.pos_exception_events(id,restaurant_id,location_id)
       on delete restrict
);

-- Immutable note/status history, always written atomically with current review.
create table if not exists public.pos_exception_review_audit (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null,
    restaurant_id uuid not null references public.restaurants(id),
    location_id uuid not null references public.locations(id),
    request_id uuid not null unique,
    actor_id uuid not null,
    action text not null check (action in ('review','reopen','recovery_claim','verify_recovery','reject_recovery')),
    review_status text,
    resolution text,
    note text,
    created_at timestamptz not null default now(),
    constraint pos_exception_audit_event_tenant_fk
       foreign key (event_id,restaurant_id,location_id)
       references public.pos_exception_events(id,restaurant_id,location_id)
       on delete restrict
);
create index if not exists pos_exception_audit_event_idx
  on public.pos_exception_review_audit (event_id,created_at);

-- Pending recovered-payment claims do NOT affect revenue. Approval and
-- verified POS exclusion are separate future steps.
create table if not exists public.pos_recovery_claims (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null,
    restaurant_id uuid not null references public.restaurants(id),
    location_id uuid not null references public.locations(id),
    request_id uuid not null unique,
    claimed_amount numeric(14,2) not null check (claimed_amount > 0),
    payment_method text not null check (payment_method in ('cash','card','bank','other')),
    payment_reference text not null check (length(payment_reference) between 4 and 160),
    status text not null default 'pending_verification'
      check (status in ('pending_verification','verified','rejected')),
    already_in_pos boolean,
    claimed_by uuid not null,
    verified_by uuid,
    claimed_at timestamptz not null default now(),
    verified_at timestamptz,
    verification_request_id uuid unique,
    verification_note text,
    unique (event_id,payment_reference),
    unique (restaurant_id,location_id,payment_reference),
    constraint pos_recovery_event_tenant_fk
       foreign key (event_id,restaurant_id,location_id)
       references public.pos_exception_events(id,restaurant_id,location_id)
       on delete restrict,
    constraint pos_recovery_verification_guard
       check (status = 'pending_verification' or
         (verified_at is not null and verified_by is not null
          and verification_request_id is not null
          and (status <> 'verified' or already_in_pos is not null))),
    constraint pos_recovery_separate_approver
       check (verified_by is null or verified_by <> claimed_by)
);
create index if not exists pos_recovery_claims_event_idx
  on public.pos_recovery_claims(event_id,claimed_at);

-- Only an approved, verifiably complete financial day may be signed off.
-- No RPC for sign-offs is enabled in the first review-only release.
create table if not exists public.pos_exception_daily_signoffs (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id),
    location_id uuid not null references public.locations(id),
    trading_date date not null,
    daily_source_id uuid not null,
    signed_by uuid not null,
    signed_at timestamptz not null default now(),
    manager_note text,
    unique (restaurant_id,location_id,trading_date),
    constraint pos_signoff_matches_source_day_fk
      foreign key (daily_source_id,restaurant_id,location_id,trading_date)
      references public.pos_captiva_daily_sources(id,restaurant_id,location_id,trading_date)
      on delete restrict
);

-- A manager cannot sign off a day until the original Captiva dashboard
-- source is complete AND independently reconciled, and all source exceptions
-- for the day have a resolved manager review. No signoff RPC is enabled yet.
create or replace function restaurantai_private.guard_pos_daily_signoff()
returns trigger
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_coverage text;
  v_state text;
  v_unresolved bigint;
  v_pending_recoveries bigint;
begin
  select d.journal_coverage, d.reconciliation_state
    into v_coverage,v_state
  from public.pos_captiva_daily_sources d
  where d.id=new.daily_source_id
    and d.restaurant_id=new.restaurant_id
    and d.location_id=new.location_id
    and d.trading_date=new.trading_date;
  if not found or v_coverage <> 'complete' or v_state <> 'verified' then
    raise exception 'Day not eligible for sign-off: source incomplete or unverified';
  end if;
  select count(*) into v_unresolved
  from public.pos_exception_events e
  left join public.pos_exception_reviews r on r.event_id=e.id
  where e.restaurant_id=new.restaurant_id
    and e.location_id=new.location_id
    and e.trading_date=new.trading_date
    and coalesce(r.review_status,'open') <> 'resolved';
  if v_unresolved <> 0 then
    raise exception 'Day not eligible for sign-off: unresolved exceptions';
  end if;
  select count(*) into v_pending_recoveries
  from public.pos_recovery_claims c
  join public.pos_exception_events e on e.id=c.event_id
  where c.restaurant_id=new.restaurant_id
    and c.location_id=new.location_id
    and e.trading_date=new.trading_date
    and c.status='pending_verification';
  if v_pending_recoveries <> 0 then
    raise exception 'Day not eligible for sign-off: recovered payment claims pending verification';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pos_signoff_guard on public.pos_exception_daily_signoffs;
create trigger trg_pos_signoff_guard
before insert or update on public.pos_exception_daily_signoffs
for each row execute function restaurantai_private.guard_pos_daily_signoff();

-- Tenant checks are enforced even on service-role writes.
do $$
declare t text;
begin
  foreach t in array array[
    'pos_captiva_daily_sources','pos_exception_events','pos_exception_reviews',
    'pos_exception_review_audit','pos_recovery_claims','pos_exception_daily_signoffs'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_pos_tenant_check', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function restaurantai_private.check_pos_location()',
      'trg_pos_tenant_check', t);
  end loop;

  foreach t in array array[
    'pos_captiva_daily_sources','pos_exception_events',
    'pos_exception_review_audit','pos_exception_daily_signoffs'
  ] loop
    execute format('drop trigger if exists %I on public.%I','trg_pos_immutable',t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function restaurantai_private.deny_source_edit()',
      'trg_pos_immutable',t);
  end loop;
end;
$$;

-- No browser writes. Browser reads require matching membership/role AND
-- the user's specific authorised restaurant/location. Service role is used
-- only by the authenticated server endpoint after checking the real user.
do $$
declare
  t text;
  required_permission text;
begin
  foreach t in array array[
    'pos_captiva_daily_sources','pos_exception_events','pos_exception_reviews',
    'pos_exception_review_audit','pos_recovery_claims','pos_exception_daily_signoffs'
  ] loop
    required_permission := case
      when t in ('pos_captiva_daily_sources','pos_exception_events') then 'view'
      else 'edit'
    end;
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('drop policy if exists %I on public.%I','pos_manager_read',t);
    execute format('create policy %I on public.%I for select to authenticated using (restaurantai_private.can_review_pos(restaurant_id,location_id,%L))',
      'pos_manager_read',t,required_permission);
  end loop;
end;
$$;

-- Atomic authenticated-manager review mutation, callable ONLY from the
-- server-side edge function using the service-role token. SECURITY INVOKER:
-- authorisation is checked in the Edge Function before calling this.
create or replace function public.pos_record_exception_review(
    p_event_id uuid,
    p_actor_id uuid,
    p_request_id uuid,
    p_status text,
    p_resolution text,
    p_note text
) returns uuid
language plpgsql security invoker
set search_path = ''
as $$
declare
    v_event public.pos_exception_events%rowtype;
    v_review_id uuid;
    v_existing_event uuid;
    v_existing_action text;
begin
    if p_actor_id is null or p_event_id is null or p_request_id is null
       or p_status not in ('reviewing','resolved','reopened')
       or p_resolution not in ('pending','paid_in_pos','paid_outside_pos_pending',
          'confirmed_unpaid','legitimate_cancellation','invalid_event')
       or length(coalesce(p_note,'')) > 4000
       or (p_status='resolved' and
           (p_resolution='pending' or length(trim(coalesce(p_note,''))) < 5))
    then
       raise exception 'Invalid exception review fields';
    end if;

    -- Serialise review changes to the same event, including idempotent retries.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_event_id::text,0)
    );
    select a.event_id,a.action into v_existing_event,v_existing_action
      from public.pos_exception_review_audit a where a.request_id=p_request_id;
    if found then
        if v_existing_event <> p_event_id
           or v_existing_action not in ('review','reopen') then
            raise exception 'Review request ID reused for another action or event';
        end if;
        select id into v_review_id
          from public.pos_exception_reviews where event_id = p_event_id;
        return v_review_id;
    end if;

    select * into v_event from public.pos_exception_events where id=p_event_id;
    if not found then raise exception 'Exception event not found'; end if;

    insert into public.pos_exception_reviews (
      event_id,restaurant_id,location_id,
      review_status,resolution,last_note,reviewed_by,reviewed_at
    ) values (
      v_event.id,v_event.restaurant_id,v_event.location_id,
      p_status,p_resolution,p_note,p_actor_id,now()
    )
    on conflict (event_id) do update set
       review_status=excluded.review_status,
       resolution=excluded.resolution,
       last_note=excluded.last_note,
       reviewed_by=excluded.reviewed_by,
       reviewed_at=excluded.reviewed_at,
       updated_at=now()
    returning id into v_review_id;

    insert into public.pos_exception_review_audit (
      event_id,restaurant_id,location_id,request_id,actor_id,
      action,review_status,resolution,note
    ) values (
      v_event.id,v_event.restaurant_id,v_event.location_id,
      p_request_id,p_actor_id,
      case when p_status='reopened' then 'reopen' else 'review' end,
      p_status,p_resolution,p_note
    );
    return v_review_id;
end;
$$;
revoke all on function public.pos_record_exception_review(uuid,uuid,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.pos_record_exception_review(uuid,uuid,uuid,text,text,text)
  to service_role;

-- This does NOT mark a recovered payment as verified or post it to sales.
create or replace function public.pos_claim_recovered_payment(
    p_event_id uuid,
    p_actor_id uuid,
    p_request_id uuid,
    p_amount numeric,
    p_method text,
    p_reference text
) returns uuid
language plpgsql security invoker
set search_path = ''
as $$
declare
    v_event public.pos_exception_events%rowtype;
    v_id uuid;
    v_existing_event uuid;
begin
    if p_actor_id is null or p_request_id is null or p_event_id is null
      or p_amount is null or p_amount <= 0 or p_amount > 9999999
      or p_method not in ('cash','card','bank','other')
      or length(trim(coalesce(p_reference,''))) not between 4 and 160
    then raise exception 'Invalid recovered-payment claim'; end if;
    select id,event_id into v_id,v_existing_event from public.pos_recovery_claims
      where request_id=p_request_id;
    if found then
      if v_existing_event <> p_event_id then
        raise exception 'Recovery request ID reused for another event';
      end if;
      return v_id;
    end if;

    select * into v_event from public.pos_exception_events where id=p_event_id;
    if not found then raise exception 'Exception event not found'; end if;

    insert into public.pos_recovery_claims (
      event_id,restaurant_id,location_id,
      request_id,claimed_amount,payment_method,payment_reference,claimed_by
    ) values (
      v_event.id,v_event.restaurant_id,v_event.location_id,
      p_request_id,p_amount,p_method,trim(p_reference),p_actor_id
    ) returning id into v_id;

    insert into public.pos_exception_review_audit (
      event_id,restaurant_id,location_id,request_id,actor_id,action,note
    ) values (
      v_event.id,v_event.restaurant_id,v_event.location_id,
      p_request_id,p_actor_id,'recovery_claim',
      'Recovery claim submitted for independent payment verification'
    );
    return v_id;
end;
$$;
revoke all on function public.pos_claim_recovered_payment(uuid,uuid,uuid,numeric,text,text)
  from public,anon,authenticated;
grant execute on function public.pos_claim_recovered_payment(uuid,uuid,uuid,numeric,text,text)
  to service_role;

-- Finance verification approves the payment's existence and whether Captiva
-- already counted it. The result NEVER updates official POS sales or the XLS ledger.
-- A different user must review and approve a recovered payment.
create or replace function public.pos_verify_recovery_claim(
    p_claim_id uuid,
    p_reviewer_id uuid,
    p_request_id uuid,
    p_decision text,
    p_already_in_pos boolean,
    p_note text
) returns jsonb
language plpgsql security invoker
set search_path = ''
as $
declare
  v_claim public.pos_recovery_claims%rowtype;
  v_status text;
begin
  if p_claim_id is null or p_reviewer_id is null or p_request_id is null
     or p_decision not in ('verified','rejected')
     or length(trim(coalesce(p_note,''))) not between 10 and 4000
     or (p_decision='verified' and p_already_in_pos is null)
  then
    raise exception 'Invalid recovery approval';
  end if;
  -- Lock claim so concurrent reviewers cannot both verify it.
  select * into v_claim from public.pos_recovery_claims
   where id=p_claim_id for update;
  if not found then raise exception 'Recovery claim missing'; end if;
  if p_reviewer_id=v_claim.claimed_by then
     raise exception 'Recovered payments require an independent reviewer';
  end if;
  if v_claim.status <> 'pending_verification' then
     if v_claim.verification_request_id=p_request_id
        and v_claim.verified_by=p_reviewer_id
        and v_claim.status=p_decision
     then return pg_catalog.jsonb_build_object(
        'status',v_claim.status,'recovery_claim_id',v_claim.id,
        'already_in_pos',v_claim.already_in_pos,
        'revenue_changed',false,'already_processed',true);
     end if;
     raise exception 'Recovery already decided and cannot be overwritten';
  end if;

  update public.pos_recovery_claims set
     status=p_decision,
     already_in_pos=case when p_decision='verified' then p_already_in_pos else null end,
     verified_by=p_reviewer_id,
     verified_at=now(),
     verification_request_id=p_request_id,
     verification_note=trim(p_note)
   where id=p_claim_id;
  insert into public.pos_exception_review_audit (
     event_id,restaurant_id,location_id,
     request_id,actor_id,action,note
   ) values (
     v_claim.event_id,v_claim.restaurant_id,v_claim.location_id,
     p_request_id,p_reviewer_id,
     case when p_decision='verified' then 'verify_recovery' else 'reject_recovery' end,
     trim(p_note)
   );
  return pg_catalog.jsonb_build_object(
      'status',p_decision,'recovery_claim_id',v_claim.id,
      'already_in_pos',case when p_decision='verified' then p_already_in_pos else null end,
      'revenue_changed',false,'already_processed',false
  );
end;
$;
revoke all on function public.pos_verify_recovery_claim(uuid,uuid,uuid,text,boolean,text)
  from public,anon,authenticated;
grant execute on function public.pos_verify_recovery_claim(uuid,uuid,uuid,text,boolean,text)
  to service_role;

-- Important: the above is a review-only design, NOT permission to import.
-- Oracle must use a separate signed internal ingestion endpoint later.
