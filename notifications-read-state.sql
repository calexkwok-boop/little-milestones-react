-- Moves "mark as read" / dismiss state for the reactions/comments/replies
-- notification feed from localStorage to the database, so it persists
-- across logins, browsers, and devices instead of resetting whenever local
-- storage is cleared (private browsing, "clear data on close", new browser).
-- Mirrors how birthday_notifications already works (server-side, real deletes).

alter table public.profiles add column if not exists notif_cleared_at timestamptz;

create table if not exists public.dismissed_notifications (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);

alter table public.dismissed_notifications enable row level security;

create policy "Users can view their own dismissed notifications"
on public.dismissed_notifications
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can dismiss their own notifications"
on public.dismissed_notifications
for insert
to authenticated
with check (user_id = auth.uid());
