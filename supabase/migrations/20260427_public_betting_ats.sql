-- Add per-team Last 10 ATS / SU snapshots to public_betting. We're already
-- scraping the SAO game page for public betting %; the same page has both
-- teams' situational trends in `data-spread` / `data-wins` attributes on
-- their respective <tr> rows. One extra parse, no extra fetch.
alter table public.public_betting
  add column if not exists away_last_10_ats_pct numeric(4,3),
  add column if not exists away_last_10_su_pct  numeric(4,3),
  add column if not exists home_last_10_ats_pct numeric(4,3),
  add column if not exists home_last_10_su_pct  numeric(4,3);
