-- =============================================================
-- Lock Street - initial database schema
-- Tables: picks, subscriptions, push_subscriptions
-- Run in Supabase Dashboard -> SQL Editor (or via supabase CLI).
-- Idempotent: safe to re-run.
-- =============================================================

-- ---------- picks ----------
-- Each row = one ATS pick on a specific game.
create table if not exists public.picks (
  id            bigserial primary key,
  game_id       text       not null,
  league        text       not null check (league in ('nfl','cfb')),
  season        int        not null,
  week          int,
  side          text       not null,
  units         numeric(3,1) not null default 1.0 check (units between 0.5 and 5.0),
  reasoning     text,
  visibility    text       not null default 'paid' check (visibility in ('public','paid')),
  result        text       check (result in ('win','loss','push','pending')) default 'pending',
  posted_at     timestamptz not null default now(),
  locks_at      timestamptz,
  graded_at     timestamptz,
  created_by    uuid       references auth.users(id),
  unique(game_id)
);
create index if not exists picks_season_week_idx on public.picks(season, week);
create index if not exists picks_visibility_idx  on public.picks(visibility, posted_at desc);

-- ---------- subscriptions ----------
-- Mirror of Stripe subscription state, keyed by Supabase user.
create table if not exists public.subscriptions (
  user_id              uuid       primary key references auth.users(id) on delete cascade,
  stripe_customer_id   text       unique,
  stripe_subscription_id text     unique,
  tier                 text       check (tier in ('weekly','monthly','season')),
  status               text       not null default 'inactive'
                                  check (status in ('active','inactive','past_due','canceled','trialing')),
  current_period_end   timestamptz,
  cancel_at_period_end boolean    not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists subscriptions_status_idx on public.subscriptions(status);

-- ---------- push_subscriptions ----------
-- Web Push endpoints. One row per device subscription.
create table if not exists public.push_subscriptions (
  id          bigserial primary key,
  user_id     uuid       references auth.users(id) on delete cascade,
  endpoint    text       unique not null,
  p256dh      text       not null,
  auth_secret text       not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists push_subs_user_idx on public.push_subscriptions(user_id);

-- ---------- updated_at trigger for subscriptions ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- =============================================================
-- Row Level Security policies
-- =============================================================
alter table public.picks enable row level security;
alter table public.subscriptions enable row level security;
alter table public.push_subscriptions enable row level security;

-- ----- picks -----
-- Anyone can read PUBLIC picks (free weekly pick).
drop policy if exists "Anyone reads public picks" on public.picks;
create policy "Anyone reads public picks" on public.picks
  for select using (visibility = 'public');

-- Authenticated subscribers can read PAID picks.
drop policy if exists "Subscribers read paid picks" on public.picks;
create policy "Subscribers read paid picks" on public.picks
  for select to authenticated using (
    visibility = 'paid'
    and exists (
      select 1 from public.subscriptions s
      where s.user_id = auth.uid()
        and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
    )
  );

-- Only admins (via app_metadata.role='admin') can write picks.
drop policy if exists "Admins manage picks" on public.picks;
create policy "Admins manage picks" on public.picks
  for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  with check ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- ----- subscriptions -----
-- Users can read their own subscription row only.
drop policy if exists "Users read own subscription" on public.subscriptions;
create policy "Users read own subscription" on public.subscriptions
  for select to authenticated using (user_id = auth.uid());

-- Only service role writes subscriptions (Stripe webhooks bypass RLS via service key).

-- ----- push_subscriptions -----
-- Users can read/write only their own push endpoints.
drop policy if exists "Users manage own push subs" on public.push_subscriptions;
create policy "Users manage own push subs" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Done.
