-- Lock Street — extend notifications.type check for comments + pick_actions
-- ====================================================================
-- The original notifications schema (20260429_notifications.sql) hard-
-- coded the allowed types: new_follower, pick_graded, free_pick_drop,
-- system. Adding three new types for the comments + tail/fade fan-out:
--   new_comment   — someone commented on your post or pick
--   new_tail      — someone tailed your pick
--   new_fade      — someone faded your pick
--
-- Defensive: wrap in a DO block with an EXISTS check so this migration
-- can run on a project where the notifications table hasn't been
-- created yet. Without the guard, the ALTER would error and Supabase's
-- SQL editor (transactional) would roll back any other DDL applied in
-- the same paste — the failure mode that briefly blocked
-- comments + pick_actions creation in 2026-04-30.
-- ====================================================================

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'notifications'
  ) then
    execute 'alter table public.notifications drop constraint if exists notifications_type_check';
    execute $constraint$
      alter table public.notifications add constraint notifications_type_check
        check (type in (
          'new_follower',
          'pick_graded',
          'free_pick_drop',
          'system',
          'new_comment',
          'new_tail',
          'new_fade'
        ))
    $constraint$;
  end if;
end $$;
