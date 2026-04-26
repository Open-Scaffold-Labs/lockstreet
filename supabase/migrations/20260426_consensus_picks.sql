-- Consensus picks (public-betting splits) — daily snapshot
-- Source for now: VSiN (data.vsin.com/betting-splits). One row per
-- (sport, game, team) — both teams of a game share a `game_code` so the
-- frontend can pair home/away rows. Stopgap until paid feed (OddsJam etc.)

create table if not exists public.consensus_picks (
  id                  uuid primary key default gen_random_uuid(),
  sport               text not null,                 -- nfl | cfb | mlb | nba | nhl
  book                text not null default 'consensus',
  game_code           text,                           -- shared between paired team rows
  team                text not null,                  -- full display name from source
  opponent            text,
  is_home             boolean,
  spread              numeric,
  spread_handle_pct   int,
  spread_bet_pct      int,
  total_line          numeric,
  total_handle_pct    int,
  total_bet_pct       int,
  ml                  int,
  ml_handle_pct       int,
  ml_bet_pct          int,
  fetched_at          timestamptz default now(),
  unique (sport, book, game_code, team)
);

create index if not exists consensus_picks_sport_idx     on public.consensus_picks(sport);
create index if not exists consensus_picks_gamecode_idx  on public.consensus_picks(game_code);
create index if not exists consensus_picks_team_idx      on public.consensus_picks(team);

alter table public.consensus_picks enable row level security;

-- Anyone (incl. anon) can read consensus data — public info on /lines
create policy "anyone reads consensus_picks" on public.consensus_picks for select using (true);

-- Writes happen only via service role (the cron endpoint), which bypasses RLS.
-- No INSERT/UPDATE/DELETE policies for anon/authenticated → effectively read-only
-- to client-side code, the cron is the only writer.
