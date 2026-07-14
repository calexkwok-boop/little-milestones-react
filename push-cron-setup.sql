-- Daily scheduled push notifications (birthday reminders, prompt-of-day nudge).
-- The service-role key used to authenticate the call is stored separately in
-- Postgres Vault (not in this file) as the secret named 'service_role_key' —
-- see vault.create_secret(), run once outside version control.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'daily-push-notifications',
  '0 15 * * *', -- once daily at 15:00 UTC; see plan notes on timezone limitation
  $$
  select net.http_post(
    url := 'https://guilqxrwuhesmmwwatoq.supabase.co/functions/v1/send-scheduled-notifications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    )
  );
  $$
);
