-- =============================================================================
-- Lock Street — manual setup script, 2026-04-29
-- =============================================================================
-- RUN IN: Supabase Dashboard → SQL Editor → for the `lockstreet` project
--         (project ref chwijzlynfnxvzfeydtf, in the mlav-personal free org).
--
-- This script applies the contests migration that never made it to the live
-- Supabase project. It does NOT delete any data — Lock Street is in test mode
-- and Matt's test posts / test picks / dummy bets stay in the database until
-- he explicitly says we're going live and to clean up. See CLAUDE.md → Critical
-- user rules → #4 for the standing rule.
--
-- Idempotent: safe to re-run. CREATE TABLE IF NOT EXISTS / DROP POLICY IF
-- EXISTS guarded.
-- =============================================================================


-- =============================================================================
-- STEP 1 — Apply the contests migration that never made it to production.
-- =============================================================================
-- Symptom we're fixing: /contest renders the literal string
--   "Error: Could not find the table 'public.contests' in the schema cache"
-- because the migration file 20260426_contests.sql was authored locally but
-- never applied. This block is the same migration, idempotent.

create table if not exists public.contests (
  id                uuid primary key default gen_random_uuid(),
  season            int not null,
  week              int not null,
  status            text not null default 'open',
  first_kickoff_at  timestamptz,
  end_at            timestamptz,
  mnf_game_id       text,
  mnf_total_actual  int,
  mnf_qb_yds_actual int,
  winner_user_id    uuid references auth.users(id),
  created_at        timestamptz default now(),
  unique (season, week)
);

create index if not exists contests_status_idx on public.contests(status);

create table if not exists public.contest_entries (
  id                    uuid primary key default gen_random_uuid(),
  contest_id            uuid not null references public.contests(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  mnf_total_prediction  int,
  mnf_qb_yds_prediction int,
  picks_count           int default 0,
  qualified             boolean default false,
  wins                  int default 0,
  losses                int default 0,
  pushes                int default 0,
  submitted_at          timestamptz default now(),
  unique (contest_id, user_id)
);

create index if not exists contest_entries_contest_idx on public.contest_entries(contest_id);
create index if not exists contest_entries_user_idx    on public.contest_entries(user_id);

create table if not exists public.contest_picks (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references public.contest_entries(id) on delete cascade,
  contest_id    uuid not null references public.contests(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  game_id       text not null,
  league        text not null,
  home_abbr     text,
  away_abbr     text,
  kickoff_at    timestamptz,
  side          text not null,
  spread_taken  numeric not null,
  result        text not null default 'pending',
  graded_at     timestamptz,
  final_home    int,
  final_away    int,
  created_at    timestamptz default now(),
  unique (entry_id, game_id)
);

create index if not exists contest_picks_contest_idx on public.contest_picks(contest_id);
create index if not exists contest_picks_user_idx    on public.contest_picks(user_id);
create index if not exists contest_picks_result_idx  on public.contest_picks(result);

alter table public.contests        enable row level security;
alter table public.contest_entries enable row level security;
alter table public.contest_picks   enable row level security;

drop policy if exists "anyone reads contests"        on public.contests;
drop policy if exists "anyone reads contest_entries" on public.contest_entries;
drop policy if exists "anyone reads contest_picks"   on public.contest_picks;
create policy "anyone reads contests"        on public.contests        for select using (true);
create policy "anyone reads contest_entries" on public.contest_entries for select using (true);
create policy "anyone reads contest_picks"   on public.contest_picks   for select using (true);

drop policy if exists "users insert own entry"             on public.contest_entries;
drop policy if exists "users update own entry while open"  on public.contest_entries;
create policy "users insert own entry" on public.contest_entries
  for insert with check (auth.uid() = user_id);
create policy "users update own entry while open" on public.contest_entries
  for update using (
    auth.uid() = user_id
    and contest_id in (
      select id from public.contests
      where status = 'open'
        and (first_kickoff_at is null or first_kickoff_at > now())
    )
  );

drop policy if exists "users insert own picks"              on public.contest_picks;
drop policy if exists "users update own picks while open"   on public.contest_picks;
drop policy if exists "users delete own picks while open"   on public.contest_picks;
create policy "users insert own picks" on public.contest_picks
  for insert with check (
    auth.uid() = user_id
    and contest_id in (
      select id from public.contests
      where status = 'open'
        and (first_kickoff_at is null or first_kickoff_at > now())
    )
  );
create policy "users update own picks while open" on public.contest_picks
  for update using (
    auth.uid() = user_id
    and contest_id in (
      select id from public.contests
      where status = 'open'
        and (first_kickoff_at is null or first_kickoff_at > now())
    )
  );
create policy "users delete own picks while open" on public.contest_picks
  for delete using (
    auth.uid() = user_id
    and contest_id in (
      select id from public.contests
      where status = 'open'
        and (first_kickoff_at is null or first_kickoff_at > now())
    )
  );

drop policy if exists "admins manage contests"        on public.contests;
drop policy if exists "admins manage contest_entries" on public.contest_entries;
drop policy if exists "admins manage contest_picks"   on public.contest_picks;
create policy "admins manage contests"        on public.contests        for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins manage contest_entries" on public.contest_entries for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins manage contest_picks"   on public.contest_picks   for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');


-- =============================================================================
-- DONE.
-- =============================================================================
-- After running:
--   1. /contest no longer shows the schema-cache error — friendly empty state
--      instead. Already verified ✓.
--   2. The contest module is dormant during off-season; this just lets the
--      table exist so reads don't error. Real contests open during NFL/CFB
--      season.
--
-- Test data (Lock Street Test posts on /feed, "Database Test" reasoning on
-- the BOS pick, dummy bets, etc.) is INTENTIONALLY left in place per CLAUDE.md
-- rule #4. Don't delete it until Matt says "we're going live, clean up."
-- =============================================================================
