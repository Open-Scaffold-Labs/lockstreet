-- =============================================================
-- Lock Street - Bankroll tracker
-- One row per bet a user logs. RLS-scoped to the user.
-- =============================================================

create table if not exists public.bets (
  id           bigserial primary key,
  user_id      uuid       not null references auth.users(id) on delete cascade,
  game_id      text,                                   -- optional ESPN game id
  pick_id      bigint     references public.picks(id) on delete set null,
  league       text       check (league in ('nfl','cfb','nba','mlb','nhl','other')) default 'nfl',
  description  text       not null,                    -- "PHI -3.5", "Over 47.5"
  bet_type     text       check (bet_type in ('spread','total','moneyline','prop','parlay','other')) default 'spread',
  units        numeric(5,2) not null check (units > 0),
  odds         text,                                   -- "-110", "+150"
  result       text       check (result in ('win','loss','push','pending')) default 'pending',
  payout       numeric(10,2),                          -- profit/loss in dollars (computed at grade time)
  unit_size    numeric(10,2) not null default 25.00 check (unit_size > 0),
  notes        text,
  placed_at    timestamptz not null default now(),
  graded_at    timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists bets_user_placed_idx on public.bets(user_id, placed_at desc);
create index if not exists bets_user_result_idx on public.bets(user_id, result);

alter table public.bets enable row level security;

drop policy if exists "Users manage own bets" on public.bets;
create policy "Users manage own bets" on public.bets
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Convenience view: per-user rolling totals.
create or replace view public.bankroll_summary as
select
  user_id,
  count(*)                                                  as total_bets,
  count(*) filter (where result = 'win')                    as wins,
  count(*) filter (where result = 'loss')                   as losses,
  count(*) filter (where result = 'push')                   as pushes,
  count(*) filter (where result = 'pending')                as pending,
  coalesce(sum(units) filter (where result <> 'pending'), 0)              as units_risked,
  coalesce(sum(payout) filter (where result <> 'pending'), 0)             as net_dollars,
  coalesce(
    sum(payout) filter (where result <> 'pending') /
    nullif(sum(units * unit_size) filter (where result <> 'pending'), 0)
  , 0) * 100                                                              as roi_pct
from public.bets
group by user_id;

grant select on public.bankroll_summary to authenticated;
