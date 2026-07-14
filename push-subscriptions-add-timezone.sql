-- Captured client-side via Intl.DateTimeFormat().resolvedOptions().timeZone
-- at subscribe time, so send-scheduled-notifications can target each user's
-- local morning instead of one fixed UTC hour for everyone.

alter table public.push_subscriptions add column if not exists timezone text;
