-- The original picks table CHECK constraint only allowed nfl|cfb. Once we
-- expanded /admin's GamePicker to support all 5 sports, posting an MLB /
-- NBA / NHL pick started failing with:
--   new row for relation "picks" violates check constraint "picks_league_check"
-- Drop + re-add the constraint so picks can be any of the 5 supported
-- leagues plus 'other' as a catch-all (matches the bets table convention).

alter table public.picks drop constraint if exists picks_league_check;

alter table public.picks add constraint picks_league_check
  check (league in ('nfl', 'cfb', 'mlb', 'nba', 'nhl', 'other'));
