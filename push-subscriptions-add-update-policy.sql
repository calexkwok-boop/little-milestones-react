-- usePushNotifications.js upserts with onConflict: 'endpoint' -- under RLS,
-- the "on conflict, do update" path needs its own UPDATE policy, which was
-- missing entirely (only select/insert/delete existed). Without it, any
-- resubscribe that hits an existing endpoint (very common -- many browsers
-- return the SAME subscription from pushManager.subscribe() rather than a
-- fresh one) gets silently rejected by RLS and the enable() call throws.

create policy "update own" on public.push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
