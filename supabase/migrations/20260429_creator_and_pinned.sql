-- =============================================================
-- Lock Street - creator account + pinned posts
--
-- 1. profiles.is_creator flag.
--    - New users automatically follow every is_creator account on
--      profile creation (handled client-side in upsertMyProfile).
--    - Creator accounts cannot be unfollowed by clients (DB trigger).
-- 2. posts.pinned flag.
--    - Only the post author who is_creator can flip pinned.
--    - Feed sorts pinned-first.
-- =============================================================

-- ---------- profiles.is_creator ----------
alter table public.profiles
  add column if not exists is_creator boolean not null default false;

create index if not exists profiles_is_creator_idx
  on public.profiles (is_creator) where is_creator;

-- Mark Matt (the operator) as creator. Idempotent: re-runs are no-op.
update public.profiles set is_creator = true where handle = 'lavinlocks';

-- ---------- block client-side unfollow of creators ----------
create or replace function public.follows_no_creator_unfollow()
returns trigger language plpgsql as $$
declare
  jwt_role text;
  target_is_creator boolean;
begin
  jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  if jwt_role = 'service_role' then return old; end if;

  select p.is_creator into target_is_creator
    from public.profiles p
    where p.user_id = old.followed_id;
  if coalesce(target_is_creator, false) then
    raise exception 'Cannot unfollow Lock Street creator account'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;
drop trigger if exists follows_no_creator_unfollow on public.follows;
create trigger follows_no_creator_unfollow
  before delete on public.follows
  for each row execute function public.follows_no_creator_unfollow();

-- ---------- posts.pinned ----------
alter table public.posts
  add column if not exists pinned boolean not null default false;

create index if not exists posts_pinned_idx
  on public.posts (pinned, created_at desc) where pinned;

-- ---------- relax posts immutability for creator-author pinned-only updates ----------
-- The original trigger (in 20260429_posts.sql) rejected every non-
-- service-role update. We want pinning to work for creator-authors
-- without going through the service-role API. Replacement allows an
-- update if and only if:
--   - caller's JWT role is service_role (admin), OR
--   - caller is the post's author AND the only column changing is
--     pinned AND the caller's profile.is_creator is true.
create or replace function public.posts_no_client_update()
returns trigger language plpgsql as $$
declare
  jwt_role text;
  caller   uuid;
  caller_is_creator boolean;
begin
  jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  if jwt_role = 'service_role' then return new; end if;

  caller := auth.uid();

  -- Pinned-only by creator-author: every other column must be unchanged.
  if caller is not null
     and caller = old.user_id
     and new.id = old.id
     and new.user_id   = old.user_id
     and new.body      is not distinct from old.body
     and new.pick_id   is not distinct from old.pick_id
     and new.created_at = old.created_at
     and (new.pinned is distinct from old.pinned) then
    select p.is_creator into caller_is_creator
      from public.profiles p
      where p.user_id = caller;
    if coalesce(caller_is_creator, false) then
      return new;
    end if;
  end if;

  raise exception 'posts rows are immutable from client (role=%)', coalesce(jwt_role, 'null')
    using errcode = 'check_violation';
end;
$$;

-- Need an UPDATE policy or RLS blocks the update before the trigger
-- gets a chance to allow it.
drop policy if exists "Creator updates own pinned" on public.posts;
create policy "Creator updates own pinned" on public.posts
  for update to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
