-- Pick cards on /picks were rendering '?' placeholders for team logos and
-- missing the SPREAD / O/U / ML pill row, because picks only stored side +
-- units + reasoning -- not the matchup details. The synthesizeGame()
-- fallback in PicksRoute had no team data to show.
--
-- Snapshot the relevant matchup data ON the pick at post time. This way the
-- /picks card is self-contained -- it doesn't depend on the ESPN scoreboard
-- still having the game (it won't, days/weeks later) and renders identically
-- whether the game is upcoming, live, or final-from-2-weeks-ago.

alter table public.picks
  add column if not exists home_abbr  text,
  add column if not exists away_abbr  text,
  add column if not exists home_logo  text,
  add column if not exists away_logo  text,
  add column if not exists spread_home numeric(5,1),  -- the home-team spread; away is just -spread_home
  add column if not exists total_taken numeric(5,1),  -- O/U total at post time
  add column if not exists ml_home    integer,         -- home moneyline at post time
  add column if not exists ml_away    integer;         -- away moneyline at post time
