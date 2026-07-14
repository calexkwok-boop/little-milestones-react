-- Persists the same `tag` used for the OS-level push (e.g. `like-<entryId>`),
-- so sendPushToUser can throttle repeat pushes for the same underlying thing
-- (a popular entry getting liked 5 times in an hour) without losing any of
-- the individual events from history — each still gets its own log row.

alter table public.notification_log add column if not exists tag text;
create index if not exists notification_log_user_tag_idx on public.notification_log (user_id, tag, created_at desc);
