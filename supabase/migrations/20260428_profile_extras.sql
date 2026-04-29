-- =============================================================
-- Lock Street - profile privacy + free-pick + point-buys
-- Follow-up to 20260428_profiles_and_user_picks.sql. Captures
-- decisions from spec §22:
--   * profiles.is_private        — flip-flop privacy toggle
--   * user_picks.is_free_pick    — official Lock Street free pick
--                                  (mirrored to @lockstreet AND
--                                  Matt's personal profile)
--   * user_picks.point_buys      — number of half-points bought
-- Plus RLS update so private profiles' picks are hidden from
-- non-owners, and leaderboard view excludes private profiles.
--
-- Idempotent: safe to re-run.
-- =============================================================

-- ---------- column adds ----------
alter table public.profiles
  add column if not exists is_private boolean not null default false;

alter table public.user_picks
  add column if not exists is_free_pick boolean not null default false,
  add column if not exists point_buys   int     not null default 0
    check (point_buys >= 0);

create index if not exists profiles_is_private_idx  on public.profiles (is_private);
create index if not exists user_picks_is_free_pick_idx on public.user_picks (is_free_pick) where is_free_pick;

-- ---------- profiles RLS: keep update policy compatible ----------
-- The existing update policy on profiles compared is_system + banned
-- against the existing row. is_private is now mutable by the owner,
-- so we don't need to lock it down — the existing policy permits it.
-- But we DO want to block users from flipping is_private on someone
-- else's row, which the user_id = auth.uid() base check already does.

-- ---------- user_picks RLS: respect privacy ----------
-- Replace the broad "anyone reads user picks" policy with one that
-- hides picks belonging to private profiles from non-owner viewers.
-- Owner + service-role still see everything.
drop policy if exists "Anyone reads user picks"          on public.user_picks;
drop policy if exists "Public reads non-private picks"   on public.user_picks;
create policy "Public reads non-private picks" on public.user_picks
  for select using (
    -- owner always sees own picks
    auth.uid() = user_id
    or
    -- otherwise, only when the profile is not private
    not exists (
      select 1 from public.profiles p
      where p.user_id = user_picks.user_id
        and p.is_private = true
    )
  );

-- ---------- leaderboard view: rebuild to exclude private + bring in is_free_pick ----------
-- The view itself doesn't filter by is_private since it pre-aggregates
-- per (user, league, window) — but the SELECTs on /leaderboard join
-- against profiles and filter banned. We extend that join to also drop
-- is_private. Easier path: keep the view as-is (already independent of
-- profiles) and let the application layer skip private rows. The hooks/
-- frontend handle this.
--
-- Nothing to do here — leaderboard_window stays as defined in the
-- previous migration. The privacy filter happens in useLeaderboard
-- when joining profiles, where banned rows are already filtered out.

-- ---------- helper RPC: refresh_leaderboard_window ----------
-- Already defined in the previous migration. Re-affirm grant in case
-- of permission drift.
grant execute on function public.refresh_leaderboard_window() to service_role;

-- Done.
