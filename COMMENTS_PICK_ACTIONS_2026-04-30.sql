-- =============================================================================
-- Lock Street — comments + pick_actions setup, 2026-04-30
-- =============================================================================
-- RUN IN: Supabase Dashboard → SQL Editor → for the lockstreet project.
-- Idempotent. Safe to re-run.
--
-- Mirrors supabase/migrations/20260430_comments_and_pick_actions.sql exactly.
-- Pasting this into the editor is the way to actually apply it (the migration
-- file lives in the repo for reference; production has no migration runner).
-- =============================================================================

-- ============================================================
-- comments
-- ============================================================

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  post_id     uuid    references public.posts(id)      on delete cascade,
  pick_id     uuid    references public.user_picks(id) on delete cascade,
  body        text    not null,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),

  constraint comments_one_target check (
    (post_id is not null)::int + (pick_id is not null)::int = 1
  ),
  constraint comments_body_length check (char_length(body) between 1 and 500)
);

create index if not exists comments_post_idx on public.comments(post_id, created_at desc) where post_id is not null;
create index if not exists comments_pick_idx on public.comments(pick_id, created_at desc) where pick_id is not null;
create index if not exists comments_user_idx on public.comments(user_id, created_at desc);

alter table public.comments enable row level security;

drop policy if exists "anyone reads non-deleted comments" on public.comments;
create policy "anyone reads non-deleted comments"
  on public.comments for select using (true);

drop policy if exists "users insert own comments" on public.comments;
create policy "users insert own comments"
  on public.comments for insert
  with check (auth.uid() = user_id);

drop policy if exists "authors soft-delete own comments" on public.comments;
create policy "authors soft-delete own comments"
  on public.comments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.comments_enforce_immutability()
returns trigger language plpgsql as $$
declare jwt_role text;
begin
  jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  if jwt_role = 'service_role' then
    return new;
  end if;

  if new.body is distinct from old.body
     or new.user_id is distinct from old.user_id
     or new.post_id is distinct from old.post_id
     or new.pick_id is distinct from old.pick_id
     or new.created_at is distinct from old.created_at then
    raise exception 'comments are immutable except for soft-delete'
      using errcode = 'check_violation';
  end if;

  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'cannot un-delete a comment from client'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists comments_enforce_immutability on public.comments;
create trigger comments_enforce_immutability
  before update on public.comments
  for each row execute function public.comments_enforce_immutability();

do $$ begin
  alter publication supabase_realtime add table public.comments;
exception when duplicate_object then null;
when undefined_object then null;
end $$;


-- ============================================================
-- pick_actions  (tail / fade)
-- ============================================================

create table if not exists public.pick_actions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  pick_id     uuid not null references public.user_picks(id) on delete cascade,
  action      text not null,
  created_at  timestamptz not null default now(),

  constraint pick_actions_action check (action in ('tail','fade')),
  unique (user_id, pick_id)
);

create index if not exists pick_actions_pick_idx   on public.pick_actions(pick_id);
create index if not exists pick_actions_user_idx   on public.pick_actions(user_id, created_at desc);
create index if not exists pick_actions_action_idx on public.pick_actions(pick_id, action);

alter table public.pick_actions enable row level security;

drop policy if exists "anyone reads pick_actions" on public.pick_actions;
create policy "anyone reads pick_actions"
  on public.pick_actions for select using (true);

drop policy if exists "users insert own pick_actions" on public.pick_actions;
create policy "users insert own pick_actions"
  on public.pick_actions for insert with check (auth.uid() = user_id);

drop policy if exists "users update own pick_actions" on public.pick_actions;
create policy "users update own pick_actions"
  on public.pick_actions for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users delete own pick_actions" on public.pick_actions;
create policy "users delete own pick_actions"
  on public.pick_actions for delete using (auth.uid() = user_id);

create or replace function public.pick_actions_enforce_lock()
returns trigger language plpgsql as $$
declare
  jwt_role text;
  pk_kickoff timestamptz;
begin
  jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  if jwt_role = 'service_role' then
    return new;
  end if;

  select kickoff_at into pk_kickoff from public.user_picks where id = new.pick_id;
  if pk_kickoff is null then
    raise exception 'pick_actions: parent pick not found' using errcode = 'foreign_key_violation';
  end if;
  if now() >= pk_kickoff then
    raise exception 'pick_actions: locked, kickoff has passed (kickoff=%, now=%)', pk_kickoff, now()
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists pick_actions_enforce_lock on public.pick_actions;
create trigger pick_actions_enforce_lock
  before insert or update on public.pick_actions
  for each row execute function public.pick_actions_enforce_lock();

do $$ begin
  alter publication supabase_realtime add table public.pick_actions;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- ============================================================
-- notifications type check — extend for new_comment / tail / fade
-- ============================================================
-- The original notifications schema constrains `type` to a fixed list.
-- Adding three new types so the comment + tail/fade fan-out can insert
-- rows. Idempotent: drop the constraint by name then re-add.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'new_follower',
    'pick_graded',
    'free_pick_drop',
    'system',
    'new_comment',
    'new_tail',
    'new_fade'
  ));


-- =============================================================================
-- DONE.
-- =============================================================================
-- Verify by visiting any /u/<handle> page after the frontend ships in commit B.
-- =============================================================================
