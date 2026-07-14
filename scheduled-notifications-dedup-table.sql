-- Tracks which scheduled push notifications (birthday reminders, prompt-of-day)
-- have already been sent, keyed by a deterministic id (e.g. "bday-<kidId>-<year>-7day"),
-- so a daily cron run doesn't re-send the same notification on subsequent days.
create table if not exists public.sent_scheduled_notifications (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- RLS enabled with no policies — default-deny for anon/authenticated roles.
-- Only the service-role client (which bypasses RLS) in send-scheduled-notifications
-- ever reads or writes this table.
alter table public.sent_scheduled_notifications enable row level security;
