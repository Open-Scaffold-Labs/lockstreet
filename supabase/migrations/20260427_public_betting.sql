-- Public betting percentages scraped from ScoresAndOdds (and potentially
-- other free sources later). One row per game per source. Read-only to
-- everyone (the data isn't sensitive); only service role writes.

create table if not exists public.public_betting (
  id           bigserial primary key,
  source       text not null default 'scoresandodds',
  league       text not null check (league in ('nfl', 'cfb', 'mlb', 'nba', 'nhl')),
  external_id  text not null,        -- SAO event id, e.g. '12234720'
  slug         text not null,        -- e.g. 'suns-vs-thunder'
  away_label   text,
  home_label   text,
  -- Spread, home perspective. spread_home_line: e.g. -10.5 (home favored).
  spread_home_line       numeric(5,1),
  spread_home_pct_bets   smallint,
  spread_home_pct_money  smallint,
  -- Moneyline, home perspective.
  ml_home_pct_bets       smallint,
  ml_home_pct_money      smallint,
  -- Total.
  total_line             numeric(5,1),
  total_over_pct_bets    smallint,
  total_over_pct_money   smallint,
  fetched_at             timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists public_betting_league_fetched_idx
  on public.public_betting (league, fetched_at desc);

alter table public.public_betting enable row level security;

drop policy if exists "anyone can read public_betting" on public.public_betting;
create policy "anyone can read public_betting"
  on public.public_betting for select
  using (true);
