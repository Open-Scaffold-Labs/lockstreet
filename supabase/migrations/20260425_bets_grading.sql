-- =============================================================
-- Add structured fields for game-based bet logging + auto-grading
-- =============================================================

alter table public.bets
  add column if not exists season       int,
  add column if not exists week         text,                            -- "1".."18", "WC","DIV","CONF","SB","BOWL"
  add column if not exists home_abbr    text,
  add column if not exists away_abbr    text,
  add column if not exists kickoff_at   timestamptz,
  add column if not exists bet_side     text check (bet_side in ('home','away','over','under')),
  add column if not exists spread_taken numeric(5,1),                    -- e.g. -3.5 (the line on the bet_side)
  add column if not exists total_taken  numeric(5,1),                    -- e.g. 47.5 (for totals)
  add column if not exists final_home   int,
  add column if not exists final_away   int;

create index if not exists bets_user_pending_idx on public.bets(user_id) where result = 'pending';
