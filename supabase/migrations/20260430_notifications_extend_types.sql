-- Lock Street — extend notifications.type check for comments + pick_actions
-- ====================================================================
-- The original notifications schema (20260429_notifications.sql) hard-
-- coded the allowed types: new_follower, pick_graded, free_pick_drop,
-- system. Adding three new types for the comments + tail/fade fan-out:
--   new_comment   — someone commented on your post or pick
--   new_tail      — someone tailed your pick
--   new_fade      — someone faded your pick
-- ====================================================================

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
