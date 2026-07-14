-- Durable record of every notification ever sent to a user (written by
-- sendPushToUser regardless of whether the actual push fired — muted
-- categories and users with no subscriptions still get logged here), so
-- nothing is silently lost just because a device was offline when it fired.

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  url text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.notification_log enable row level security;

create policy "select own" on public.notification_log for select using (auth.uid() = user_id);
create policy "update own" on public.notification_log for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- no insert/delete policy for authenticated — only service-role (edge functions) writes rows

create index if not exists notification_log_user_created_idx on public.notification_log (user_id, created_at desc);
