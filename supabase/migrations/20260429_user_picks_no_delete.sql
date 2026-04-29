-- =============================================================
-- user_picks: BEFORE DELETE immutability trigger
--
-- The "your picks are permanent" promise on the /feed page is
-- already enforced by RLS — the user_picks table has no DELETE
-- policy for the `authenticated` role, so JWT-scoped clients can't
-- delete picks. This migration adds a BEFORE DELETE trigger that
-- mirrors the existing user_picks_immutable BEFORE UPDATE trigger:
-- if a future migration accidentally adds a delete policy, the
-- trigger still rejects every non-service_role delete.
--
-- Service role can still delete (used for admin cleanup of orphaned
-- rows, etc.) — same carve-out as the update trigger.
-- =============================================================

create or replace function public.user_picks_no_client_delete()
returns trigger language plpgsql as $$
declare
  jwt_role text;
begin
  jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  if jwt_role is null or jwt_role <> 'service_role' then
    raise exception 'user_picks rows cannot be deleted from client (role=%)', coalesce(jwt_role, 'null')
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists user_picks_no_delete on public.user_picks;
create trigger user_picks_no_delete
  before delete on public.user_picks
  for each row execute function public.user_picks_no_client_delete();
