-- Lock Street weekly pick'em contest
-- ====================================================================
-- 20 picks per week required to qualify (10 NFL ATS + 10 CFB ATS, or
-- all-available when bowl/playoff slates have <10). Best raw record
-- wins. Tiebreakers: (1) closest to MNF total points, (2) closest to
-- combined MNF QB passing yards. Prize: 7-day subscription extension.

create table if not exists public.contests (
  id                uuid primary key default gen_random_uuid(),
  season            int not null,
  week              int not null,
  status            text not null default 'open',     -- open | locked | graded | paid
  first_kickoff_at  timestamptz,                       -- picks lock at this time
  end_at            timestamptz,
  mnf_game_id       text,                              -- ESPN game ID for tiebreaker game
  mnf_total_actual  int,                               -- filled in after MNF final
  mnf_qb_yds_actual int,                               -- filled in after MNF final
  winner_user_id    uuid references auth.users(id),
  created_at        timestamptz default now(),
  unique (season, week)
);

create index if not exists contests_status_idx on public.contests(status);

-- One entry per user per contest (holds tiebreakers + cached summary stats)
create table if not exists public.contest_entries (
  id                    uuid primary key default gen_random_uuid(),
  contest_id            uuid not null references public.contests(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  mnf_total_prediction  int,
  mnf_qb_yds_prediction int,
  picks_count           int default 0,
  qualified             boolean default false,         -- true once required pick count met
  wins                  int default 0,
  losses                int default 0,
  pushes                int default 0,
  submitted_at          timestamptz default now(),
  unique (contest_id, user_id)
);

create index if not exists contest_entries_contest_idx on public.contest_entries(contest_id);
create index if not exists contest_entries_user_idx    on public.contest_entries(user_id);

-- Per-game pick rows. ATS spread is locked at submit-time so post-line moves
-- don't change the grade.
create table if not exists public.contest_picks (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references public.contest_entries(id) on delete cascade,
  contest_id    uuid not null references public.contests(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  game_id       text not null,
  league        text not null,                          -- nfl | cfb
  home_abbr     text,
  away_abbr     text,
  kickoff_at    timestamptz,
  side          text not null,                          -- team abbr the user took
  spread_taken  numeric not null,
  result        text not null default 'pending',        -- pending | win | loss | push
  graded_at     timestamptz,
  final_home    int,
  final_away    int,
  created_at    timestamptz default now(),
  unique (entry_id, game_id)
);

create index if not exists contest_picks_contest_idx on public.contest_picks(contest_id);
create index if not exists contest_picks_user_idx    on public.contest_picks(user_id);
create index if not exists contest_picks_result_idx  on public.contest_picks(result);

-- ============================
-- Row Level Security
-- ============================
alter table public.contests        enable row level security;
alter table public.contest_entries enable row level security;
alter table public.contest_picks   enable row level security;

-- Anyone (incl. anon) can read contest data — leaderboard is public
create policy "anyone reads contests"        on public.contests        for select using (true);
create policy "anyone reads contest_entries" on public.contest_entries for select using (true);
create policy "anyone reads contest_picks"   on public.contest_picks   for select using (true);

-- Users manage their own entry while the contest is still open.
create policy "users insert own entry" on public.contest_entries
  for insert with check (auth.uid() = user_id);
create policy "users update own entry while open" on public.contest_entries
  for update using (
    auth.uid() = user_id
    AND contest_id IN (
      SELECT id FROM public.contests
      WHERE status = 'open'
        AND (first_kickoff_at IS NULL OR first_kickoff_at > now())
    )
  );

-- Users manage their own picks while the contest is still open.
create policy "users insert own picks" on public.contest_picks
  for insert with check (
    auth.uid() = user_id
    AND contest_id IN (
      SELECT id FROM public.contests
      WHERE status = 'open'
        AND (first_kickoff_at IS NULL OR first_kickoff_at > now())
    )
  );
create policy "users update own picks while open" on public.contest_picks
  for update using (
    auth.uid() = user_id
    AND contest_id IN (
      SELECT id FROM public.contests
      WHERE status = 'open'
        AND (first_kickoff_at IS NULL OR first_kickoff_at > now())
    )
  );
create policy "users delete own picks while open" on public.contest_picks
  for delete using (
    auth.uid() = user_id
    AND contest_id IN (
      SELECT id FROM public.contests
      WHERE status = 'open'
        AND (first_kickoff_at IS NULL OR first_kickoff_at > now())
    )
  );

-- Admins manage everything
create policy "admins manage contests"        on public.contests        for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins manage contest_entries" on public.contest_entries for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins manage contest_picks"   on public.contest_picks   for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
