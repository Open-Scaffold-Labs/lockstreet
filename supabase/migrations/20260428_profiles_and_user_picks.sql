-- =============================================================
-- Lock Street - profiles, user picks, follows, leaderboard
-- Replaces /bankroll with /profile. Every user gets a permanent,
-- mechanically-locked, auto-graded record. Following another user's
-- picks becomes the primary on-ramp for free users.
--
-- See specs/profile-and-leaderboard-spec.md for the full design.
-- Idempotent: safe to re-run.
-- =============================================================

-- ---------- profiles ----------
-- One row per Supabase user. Created via the onboarding modal
-- (first /profile visit prompts handle + fav team). The 'lockstreet'
-- system row (is_system = true) mirrors the public free pick so it
-- competes on the leaderboard alongside subscribers.
create table if not exists public.profiles (
  user_id          uuid        primary key references auth.users(id) on delete cascade,
  handle           text        unique not null
                                check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name     text        not null check (length(display_name) between 1 and 40),
  fav_team         text,
  fav_team_league  text        check (fav_team_league in ('nfl','cfb','cbb','nba','mlb','nhl')),
  avatar_url       text,
  bio              text        check (bio is null or length(bio) <= 280),
  is_system        boolean     not null default false,
  banned           boolean     not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists profiles_handle_lower_idx on public.profiles (lower(handle));
create index if not exists profiles_fav_team_idx     on public.profiles (fav_team_league, fav_team);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- user_picks ----------
-- Each row = one pick by one user on one game/market. Immutable after
-- insert (DB triggers below enforce both lock-window and immutability).
-- Snapshot columns line_at_pick / market_line capture the line at post
-- time so juice + point-buying cost can be computed even after the
-- market moves.
create table if not exists public.user_picks (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,

  game_id         text        not null,
  league          text        not null check (league in ('nfl','cfb','cbb','nba','mlb','nhl')),
  season          int         not null,
  week            int,                                       -- nullable for non-weekly sports
  bet_type        text        not null check (bet_type in ('spread','total','ml')),
  side            text        not null,                      -- e.g. 'home','away','over','under'
  units           numeric(3,1) not null check (units between 0.5 and 5.0),

  -- captured at insert; immutable post-insert
  line_at_pick    numeric(5,1),                              -- null for moneyline
  juice_at_pick   int          not null default -110,
  market_line     numeric(5,1),                              -- consensus line at insert time
  market_juice    int          default -110,

  -- matchup snapshot so the row is self-contained on the profile page
  home_abbr       text,
  away_abbr       text,
  home_logo       text,
  away_logo       text,

  locked_at       timestamptz not null default now(),
  kickoff_at      timestamptz not null,                      -- copied from game record at insert

  result          text        not null default 'pending'
                              check (result in ('pending','win','loss','push','void')),
  graded_at       timestamptz,

  created_at      timestamptz not null default now(),
  unique (user_id, game_id, bet_type)                       -- one pick per user per game per market
);
create index if not exists user_picks_user_idx       on public.user_picks (user_id, created_at desc);
create index if not exists user_picks_grading_idx    on public.user_picks (result, kickoff_at)
  where result = 'pending';
create index if not exists user_picks_window_idx     on public.user_picks (league, graded_at desc)
  where result <> 'pending';
create index if not exists user_picks_game_idx       on public.user_picks (game_id);

-- Lock-window enforcement: reject inserts after kickoff. Always stamp
-- locked_at server-side so client clock manipulation is useless.
create or replace function public.enforce_pick_lock_window()
returns trigger language plpgsql as $$
begin
  new.locked_at := now();
  if new.locked_at >= new.kickoff_at then
    raise exception 'Pick locked too late: kickoff has already passed (kickoff=%, now=%)',
      new.kickoff_at, new.locked_at
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists user_picks_lock_check on public.user_picks;
create trigger user_picks_lock_check
  before insert on public.user_picks
  for each row execute function public.enforce_pick_lock_window();

-- Immutability after insert. Service role bypasses RLS, so the grading
-- job can still write `result` and `graded_at`. Client JWTs cannot.
create or replace function public.user_picks_no_client_update()
returns trigger language plpgsql as $$
declare
  jwt_role text;
begin
  jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  if jwt_role is null or jwt_role <> 'service_role' then
    raise exception 'user_picks rows are immutable from client (role=%)', coalesce(jwt_role, 'null')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists user_picks_immutable on public.user_picks;
create trigger user_picks_immutable
  before update on public.user_picks
  for each row execute function public.user_picks_no_client_update();

-- ---------- follows ----------
create table if not exists public.follows (
  follower_id  uuid        not null references auth.users(id) on delete cascade,
  followed_id  uuid        not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);
create index if not exists follows_followed_idx on public.follows (followed_id);
create index if not exists follows_follower_idx on public.follows (follower_id);

-- =============================================================
-- Row Level Security policies
-- =============================================================
alter table public.profiles   enable row level security;
alter table public.user_picks enable row level security;
alter table public.follows    enable row level security;

-- ----- profiles -----
-- Anyone can read profiles (public-by-default). Banned profiles are
-- still returned at the row level; the app filters them client-side
-- where appropriate. (Hard-hiding via RLS would also hide them from
-- the leaderboard recompute, which we want to keep working.)
drop policy if exists "Anyone reads profiles" on public.profiles;
create policy "Anyone reads profiles" on public.profiles
  for select using (true);

-- A user can insert exactly one row, keyed to their auth.uid().
drop policy if exists "User creates own profile" on public.profiles;
create policy "User creates own profile" on public.profiles
  for insert to authenticated
  with check (user_id = auth.uid() and is_system = false);

-- A user can update their own profile, but cannot flip is_system or
-- banned. The handle column is enforced immutable by a column-level
-- trigger below.
drop policy if exists "User updates own profile" on public.profiles;
create policy "User updates own profile" on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and is_system = (select p.is_system from public.profiles p where p.user_id = auth.uid())
    and banned    = (select p.banned    from public.profiles p where p.user_id = auth.uid())
  );

-- Block handle changes after creation.
create or replace function public.profiles_handle_immutable()
returns trigger language plpgsql as $$
begin
  if new.handle is distinct from old.handle then
    raise exception 'profile handle is immutable (was %, attempted %)', old.handle, new.handle
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_handle_lock on public.profiles;
create trigger profiles_handle_lock
  before update on public.profiles
  for each row execute function public.profiles_handle_immutable();

-- ----- user_picks -----
-- Anyone can read any user pick. This is the entire point of the
-- feature: receipts are public.
drop policy if exists "Anyone reads user picks" on public.user_picks;
create policy "Anyone reads user picks" on public.user_picks
  for select using (true);

-- A user can insert their own picks. The lock-window trigger handles
-- the kickoff check; it cannot be bypassed by setting `locked_at` in
-- the payload because the trigger overwrites it with now().
drop policy if exists "User creates own picks" on public.user_picks;
create policy "User creates own picks" on public.user_picks
  for insert to authenticated
  with check (user_id = auth.uid());

-- No client-side updates or deletes. Defense-in-depth on top of the
-- immutability trigger.
-- (No update/delete policies = no permitted update/delete from JWT.)

-- ----- follows -----
drop policy if exists "Anyone reads follows" on public.follows;
create policy "Anyone reads follows" on public.follows
  for select using (true);

drop policy if exists "User manages own follows" on public.follows;
create policy "User manages own follows" on public.follows
  for all to authenticated
  using (follower_id = auth.uid())
  with check (follower_id = auth.uid());

-- =============================================================
-- Leaderboard materialized view
-- One row per (user, league, window). Refreshed by the grading job
-- after each pass: `refresh materialized view concurrently leaderboard_window`.
-- Window = 'week' / 'month' / 'season'.
-- =============================================================
drop materialized view if exists public.leaderboard_window;
create materialized view public.leaderboard_window as
with bucketed as (
  select
    p.user_id,
    p.league,
    p.season,
    p.result,
    p.units,
    p.line_at_pick,
    p.juice_at_pick,
    p.market_line,
    p.market_juice,
    p.graded_at
  from public.user_picks p
  where p.result in ('win','loss','push')
),
expanded as (
  -- Each pick can fall into multiple windows (a graded pick from
  -- yesterday counts toward week, month, AND season). Cross-join
  -- against the three window definitions.
  select b.*, w.window, w.cutoff
  from bucketed b
  cross join lateral (values
    ('week',   date_trunc('week',  now())),
    ('month',  date_trunc('month', now())),
    ('season', make_timestamptz(b.season, 1, 1, 0, 0, 0, 'UTC'))
  ) as w(win_period, cutoff)
  where b.graded_at >= w.cutoff
)
select
  user_id,
  league,
  win_period,
  count(*)                                 as picks_count,
  count(*) filter (where result = 'win')   as wins,
  count(*) filter (where result = 'loss')  as losses,
  count(*) filter (where result = 'push')  as pushes,
  -- Net units at the line/juice the user actually took.
  -- Convention: 1 unit = 1 unit of risk. Win pays 100/|juice|, loss = -1u.
  sum(case result
        when 'win'  then units * (100.0 / abs(juice_at_pick))
        when 'loss' then -units
        else 0
      end) as units_won_net,
  -- Counterfactual: same picks at consensus line/juice (no half-points bought).
  -- Difference (units_won_at_market - units_won_net) is the point-buying cost.
  sum(case result
        when 'win'  then units * (100.0 / abs(coalesce(market_juice, juice_at_pick)))
        when 'loss' then -units
        else 0
      end) as units_won_at_market,
  -- Total juice paid (sum of (1 - 100/|juice|) on losses, expressed as units risked extra)
  -- Useful for the "Juice Paid" column.
  sum(case result
        when 'win'  then 0
        when 'loss' then units * (1.0 - 100.0 / abs(juice_at_pick))
        else 0
      end) as juice_paid
from expanded
group by user_id, league, win_period;

create unique index if not exists leaderboard_window_pk
  on public.leaderboard_window (user_id, league, win_period);
create index if not exists leaderboard_window_sort_idx
  on public.leaderboard_window (league, win_period, units_won_net desc);

-- Grant SELECT to anon + authenticated so the leaderboard reads
-- without needing a server-side proxy.
grant select on public.leaderboard_window to anon, authenticated;

-- =============================================================
-- Reserved handles
-- These cannot be claimed by users. Inserted via a check inside the
-- insert flow (app-side) plus this hardcoded blocker trigger.
-- =============================================================
create or replace function public.profiles_block_reserved_handles()
returns trigger language plpgsql as $$
begin
  -- Reserved = generic / brand / app-route names. The Lock Street operators'
  -- own handles (mlav1114, luckyshawn, matt, shawn) are NOT reserved here;
  -- they belong to the actual people and need to be claimable.
  if not new.is_system and lower(new.handle) in (
    'lockstreet','admin','support','api','help','about','picks','scores',
    'lines','props','bankroll','profile','leaderboard','contest','weekly',
    'sign-in','sign-up','signup','login','logout','reset','reset-password',
    'anthropic','claude','staff','official'
  ) then
    raise exception 'Handle "%" is reserved', new.handle
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_reserved_handles on public.profiles;
create trigger profiles_reserved_handles
  before insert on public.profiles
  for each row execute function public.profiles_block_reserved_handles();

-- =============================================================
-- @lockstreet system profile
-- Synthetic user that mirrors the public free pick so it competes on
-- the leaderboard alongside subscribers' personal picks. Insert is
-- conditional so re-running the migration is safe.
-- =============================================================
do $$
declare
  sys_uid constant uuid := '00000000-0000-0000-0000-00000000ad01';
begin
  -- Bootstrap the auth.users row if it doesn't exist. We use a fixed
  -- UUID that's clearly a system marker. The email is unverifiable
  -- (no real mailbox); password is null because no one logs in as
  -- this user. Login is blocked by setting banned_until far future.
  insert into auth.users (
    id, instance_id, aud, role, email, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    banned_until
  )
  values (
    sys_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'system+lockstreet@lockstreet.app', now(),
    jsonb_build_object('provider', 'system', 'role', 'system'),
    jsonb_build_object('display_name', 'Lock Street'),
    now(), now(),
    now() + interval '1000 years'
  )
  on conflict (id) do nothing;

  -- Insert the synthetic profile. is_system bypasses the reserved-handle
  -- trigger which only blocks user-claimed reservations.
  insert into public.profiles (
    user_id, handle, display_name, bio, is_system
  ) values (
    sys_uid, 'lockstreet', 'Lock Street',
    'Official @lockstreet account. Free weekly pick mirrored here so it competes on the leaderboard alongside everyone else.',
    true
  )
  on conflict (user_id) do nothing;
exception
  when insufficient_privilege then
    -- If the migration runs without permission to touch auth.users
    -- (e.g. running via the dashboard SQL editor without service role),
    -- skip the system-profile bootstrap. Admin can run a follow-up
    -- script later — see docs.
    raise notice 'Skipping @lockstreet system bootstrap: insufficient_privilege. Run as service role to seed.';
end $$;

-- =============================================================
-- RPC for the grading cron to refresh leaderboard_window from
-- application code. Defined as SECURITY DEFINER so the service-role
-- client (which has REFRESH MATERIALIZED VIEW privilege via owner)
-- can invoke it from the API endpoint without needing the postgres
-- superuser role.
-- =============================================================
create or replace function public.refresh_leaderboard_window()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- CONCURRENTLY requires a unique index (created above) and avoids
  -- blocking concurrent reads of the view. Falls back to a plain
  -- refresh if the concurrent variant isn't available for any reason.
  begin
    refresh materialized view concurrently public.leaderboard_window;
  exception when others then
    refresh materialized view public.leaderboard_window;
  end;
end;
$$;
grant execute on function public.refresh_leaderboard_window() to service_role;

-- Done.
