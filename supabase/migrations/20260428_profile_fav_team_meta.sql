-- =============================================================
-- Lock Street - profiles.fav_team_name + fav_team_logo
-- Stores the team's full display name and logo URL on the profile
-- row so the header can render <img> + "New York Jets" without
-- re-fetching from ESPN. Captured at insert via the TeamPicker.
-- Idempotent.
-- =============================================================

alter table public.profiles
  add column if not exists fav_team_name text,
  add column if not exists fav_team_logo text;
