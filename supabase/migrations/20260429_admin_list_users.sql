-- =============================================================
-- admin_list_users() — service-role-callable RPC that returns auth
-- users without going through GoTrue's admin REST endpoint.
--
-- Why: the admin /api/admin-stats endpoint was using
-- `supabase.auth.admin.listUsers()`, which internally reads every
-- row from auth.users through GoTrue's User deserializer. The
-- synthetic @lockstreet system user (created by
-- 20260428_profiles_and_user_picks.sql) is missing fields newer
-- GoTrue versions require, so listUsers returns "Database error
-- finding user" and the admin stats panel breaks.
--
-- This function dodges GoTrue entirely. It's SECURITY DEFINER so
-- the service role can invoke it without needing direct SELECT on
-- auth.users (which PostgREST doesn't expose by default).
--
-- Filters out the system user — it's a synthetic seed, not a real
-- signup, and we don't want to count it in totals.
-- =============================================================

create or replace function public.admin_list_users()
returns table (
  id                  uuid,
  email               text,
  created_at          timestamptz,
  last_sign_in_at     timestamptz,
  email_confirmed_at  timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    id,
    email::text,
    created_at,
    last_sign_in_at,
    email_confirmed_at
  from auth.users
  where id <> '00000000-0000-0000-0000-00000000ad01'::uuid
  order by created_at desc
  limit 1000
$$;

-- Lock down: only service_role + postgres should be able to invoke.
-- (anon and authenticated must NOT see other users' emails.)
revoke all on function public.admin_list_users() from public;
revoke all on function public.admin_list_users() from anon, authenticated;
grant execute on function public.admin_list_users() to service_role;
