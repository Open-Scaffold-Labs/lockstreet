-- =============================================================
-- Lock Street - notifications inbox
-- One row per delivered notification per user. Persisted alongside
-- (or instead of) push notifications so users have a history they
-- can scroll through later, regardless of whether they had push
-- enabled at the time.
--
-- Idempotent: safe to re-run.
-- =============================================================

create table if not exists public.notifications (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  type        text        not null
              check (type in ('new_follower','pick_graded','free_pick_drop','system')),
  title       text        not null,
  body        text,
  url         text,                         -- click target
  meta        jsonb       not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id, created_at desc) where read_at is null;

alter table public.notifications enable row level security;

-- A user can read their own notifications.
drop policy if exists "User reads own notifications" on public.notifications;
create policy "User reads own notifications" on public.notifications
  for select using (auth.uid() = user_id);

-- A user can mark their own notifications as read (only the read_at
-- column is meaningfully mutable from client; other columns aren't
-- enforced immutable here but the UI never updates them).
drop policy if exists "User updates own notifications" on public.notifications;
create policy "User updates own notifications" on public.notifications
  for update to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No insert policy - rows are written by service-role only (from
-- /api/send-notifications and similar server endpoints). Defense:
-- prevents users spamming fake notifications onto each other.
