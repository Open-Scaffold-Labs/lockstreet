-- Auto-grading needs to know what kind of bet the pick is + which side was
-- taken. The text `side` field ("BOS -7.5") is for display; these are for
-- programmatic grading. Defaults so existing rows don't choke.

alter table public.picks
  add column if not exists bet_type text default 'spread'
    check (bet_type in ('spread', 'total', 'moneyline')),
  add column if not exists picked_side text
    check (picked_side in ('home', 'away', 'over', 'under'));
