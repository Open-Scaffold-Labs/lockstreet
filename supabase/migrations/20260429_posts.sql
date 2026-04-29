-- =============================================================
-- posts — text + optional embedded pick from the /feed composer.
--
-- Data model:
--   - body is required (length 1..280); empty-body posts wouldn't
--     add anything over a bare pick row, so we just don't create
--     a post in that case (the composer falls through to a
--     pick-only insert into user_picks).
--   - pick_id is optional and FK to user_picks; ON DELETE CASCADE
--     so if a service-role admin ever drops a pick, the wrapping
--     post disappears with it.
--   - Posts are immutable from the client (no update/delete
--     policies, BEFORE UPDATE/DELETE triggers as defense-in-depth).
--     Same model as user_picks — receipts are permanent.
-- =============================================================

create table if not exists public.posts (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  body        text        not null check (length(body) > 0 and length(body) <= 280),
  pick_id     uuid        references public.user_picks(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_user_idx       on public.posts (user_id, created_at desc);
create index if not exists posts_pick_idx       on public.posts (pick_id) where pick_id is not null;

alter table public.posts enable row level security;

-- ----- RLS -----
-- Public reads non-private posts (matches the user_picks privacy
-- model: posts inherit the author's profile.is_private flag).
drop policy if exists "Anyone reads posts"               on public.posts;
drop policy if exists "Public reads non-private posts"   on public.posts;
create policy "Public reads non-private posts" on public.posts
  for select
  using (
    not exists (
      select 1
      from public.profiles p
      where p.user_id = posts.user_id
        and p.is_private = true
    )
  );

drop policy if exists "User creates own posts" on public.posts;
create policy "User creates own posts" on public.posts
  for insert to authenticated
  with check (user_id = auth.uid());

-- No update/delete policies for `authenticated` — posts are
-- permanent receipts just like user_picks.

-- ----- Immutability triggers -----
create or replace function public.posts_no_client_update()
returns trigger language plpgsql as $$
declare jwt_role text;
begin
  jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  if jwt_role is null or jwt_role <> 'service_role' then
    raise exception 'posts rows are immutable from client (role=%)', coalesce(jwt_role, 'null')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists posts_immutable on public.posts;
create trigger posts_immutable
  before update on public.posts
  for each row execute function public.posts_no_client_update();

create or replace function public.posts_no_client_delete()
returns trigger language plpgsql as $$
declare jwt_role text;
begin
  jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  if jwt_role is null or jwt_role <> 'service_role' then
    raise exception 'posts rows cannot be deleted from client (role=%)', coalesce(jwt_role, 'null')
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;
drop trigger if exists posts_no_delete on public.posts;
create trigger posts_no_delete
  before delete on public.posts
  for each row execute function public.posts_no_client_delete();

-- ----- Realtime -----
-- Add to the supabase_realtime publication so the feed can
-- subscribe to INSERTs. Wrapped in a do-block because adding a
-- table that's already in the publication raises.
do $$ begin
  alter publication supabase_realtime add table public.posts;
exception when duplicate_object then
  null;
when undefined_object then
  -- Realtime not configured on this project; skip silently.
  null;
end $$;
