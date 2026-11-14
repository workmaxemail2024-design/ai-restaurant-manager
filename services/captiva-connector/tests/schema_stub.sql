-- Minimal public schema fixtures for isolated PostgreSQL CI.
-- Not a migration and NEVER run on a real Supabase project.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema if not exists auth;
grant usage on schema auth to authenticated, service_role;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;

create table public.restaurants(id uuid primary key);
create table public.locations(
    id uuid primary key,
    restaurant_id uuid references public.restaurants(id)
);
create table public.roles(
    id uuid primary key,
    restaurant_id uuid not null references public.restaurants(id),
    permissions jsonb not null default '{}'::jsonb
);
create table public.user_restaurants(
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    restaurant_id uuid not null references public.restaurants(id),
    role_id uuid references public.roles(id),
    is_active boolean not null default true
);
create table public.user_location_access(
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    restaurant_id uuid not null references public.restaurants(id),
    location_id uuid not null references public.locations(id)
);
