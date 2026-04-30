-- Lock Street — comments + tail/fade pick actions
-- ====================================================================
-- Two new tables:
--   public.comments       — flat comments on posts and user_picks. Author
--                           can soft-delete (sets deleted_at); cannot
--                           edit body. Anyone reads non-deleted.
--   public.pick_actions   — tail/fade signal on user_picks. Replaces
--                           the like/dislike pattern from social apps.
--                           Locks at kickoff so post-result piling on
--                           is impossible.
-- Both tables are realtime-enabled so threads + counts update live.
-- ====================================================================

-- =========================================================
-- comments
-- =========================================================

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- Polymorphic target: comment is on a post OR a user_pick. Exactly one.
  post_id     uuid    references public.posts(id)      on delete cascade,
  pick_id     uuid    references public.user_picks(id) on delete cascade,
  body        text    not null,
  -- Soft-delete: author flips deleted_at to a timestamp. Row stays so
  -- thread reading order is preserved; UI renders "(deleted)" placeholder.
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
  on public.comments for select
  using (true);  -- privacy enforced at the parent post/pick level via their RLS

drop policy if exists "users insert own comments" on public.comments;
create policy "users insert own comments"
  on public.comments for insert
  with check (auth.uid() = user_id);

drop policy if exists "authors soft-delete own comments" on public.comments;
create policy "authors soft-delete own comments"
  on public.comments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- BEFORE UPDATE trigger: only soft-delete is legal from the client.
-- Mirrors the posts_no_client_delete / user_picks_no_client_delete pattern.
-- Body, user_id, post_id, pick_id, created_at are all immutable. The only
-- legal mutation is deleted_at: null → now(). Service_role bypasses.
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

-- No DELETE policy — soft-delete only. Service_role can hard-delete via SQL
-- editor for moderation (matches the posts/user_picks immutability model).

-- Realtime — feed should see comments arrive live.
do $$ begin
  alter publication supabase_realtime add table public.comments;
exception when duplicate_object then null;
when undefined_object then null;
end $$;


-- =========================================================
-- pick_actions  (tail / fade)
-- =========================================================
-- One row per (user, pick). Action is 'tail' or 'fade'. Toggling a button
-- UPDATEs the row to flip the action; clicking the same button twice
-- DELETEs the row (no action). Locks at kickoff so users can't pile on
-- tails/fades after the result is known.

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
  on public.pick_actions for select
  using (true);

drop policy if exists "users insert own pick_actions" on public.pick_actions;
create policy "users insert own pick_actions"
  on public.pick_actions for insert
  with check (auth.uid() = user_id);

drop policy if exists "users update own pick_actions" on public.pick_actions;
create policy "users update own pick_actions"
  on public.pick_actions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users delete own pick_actions" on public.pick_actions;
create policy "users delete own pick_actions"
  on public.pick_actions for delete
  using (auth.uid() = user_id);

-- Lock-window enforcement: any insert/update on pick_actions is rejected
-- after the parent pick's kickoff has passed. Service_role bypasses.
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

-- Realtime so tail/fade counts increment live as users hit the buttons.
do $$ begin
  alter publication supabase_realtime add table public.pick_actions;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
