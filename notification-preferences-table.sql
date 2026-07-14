-- Per-category mute state for push notifications. Default-on for every
-- category (matches the earlier product decision to default push to on).
-- Absent row == all-true client-side; a row is only written once a user
-- actually flips something.

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birthday_reminders boolean not null default true,
  friend_activity boolean not null default true,
  partner_activity boolean not null default true,
  prompt_nudges boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy "select own" on public.notification_preferences for select using (auth.uid() = user_id);
create policy "upsert own" on public.notification_preferences for insert with check (auth.uid() = user_id);
create policy "update own" on public.notification_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
