-- =============================================================================
-- Lock Street — manual cleanup script, 2026-04-29
-- =============================================================================
-- RUN IN: Supabase Dashboard → SQL Editor → for the `lockstreet` project
--         (project ref chwijzlynfnxvzfeydtf, in the mlav-personal free org).
-- AUTH:   the SQL editor runs with service_role privileges, so RLS triggers
--         are bypassed. That's the only way to clean immutable rows.
--
-- This is split into 3 steps. Run them top-to-bottom. Each step is idempotent
-- (safe to re-run).
-- =============================================================================


-- =============================================================================
-- STEP 1 — Apply the contests migration that never made it to production.
-- =============================================================================
-- Symptom we're fixing: /contest renders the literal string
--   "Error: Could not find the table 'public.contests' in the schema cache"
-- because the migration file 20260426_contests.sql was authored locally but
-- never applied. This block is the same migration, idempotent (CREATE TABLE
-- IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, CREATE POLICY guarded).

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

-- Drop-then-create so re-runs replace the policies cleanly.
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
-- STEP 2 — Delete the test posts visible on /feed.
-- =============================================================================
-- Symptom: /feed → All shows "Lock Street Test" x3 and "DEBUG 1777448115181"
-- posts authored by @lavinlocks. The BEFORE DELETE trigger on `posts` blocks
-- non-service_role deletes; the SQL editor is service_role so it goes through.

-- Preview first — uncomment to see what will be deleted before running:
-- select id, body, created_at from public.posts
-- where body in ('Lock Street Test') or body like 'DEBUG %';

delete from public.posts
where body = 'Lock Street Test'
   or body like 'DEBUG %';


-- =============================================================================
-- STEP 3 — Delete the "Database Test, not real pick" pick.
-- =============================================================================
-- Symptom: /admin and /picks → Closed both show BOS -7.5 with reasoning
-- "Database Test, not real pick", marked as a WIN. Permanent + public.
-- Also clean up any user_picks row that was mirrored to the leaderboard pool.

-- Preview:
-- select id, game_id, side, units, reasoning, result from public.picks
-- where reasoning ilike '%database test%';
-- select id, game_id, side, units, reasoning, result from public.user_picks
-- where reasoning ilike '%database test%';

delete from public.picks
where reasoning ilike '%database test%';

delete from public.user_picks
where reasoning ilike '%database test%';


-- =============================================================================
-- DONE.
-- =============================================================================
-- After running, hard-refresh https://lockstreet.vercel.app and verify:
--   1. /contest no longer shows the schema-cache error.
--   2. /feed → All only shows real picks (CLE -8.5 free pick, etc.).
--   3. /picks → Closed only shows real graded picks (no "Database Test").
-- =============================================================================
