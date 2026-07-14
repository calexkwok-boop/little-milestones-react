-- Switches the scheduled-notifications cron from once daily at a fixed UTC
-- hour to hourly, so send-scheduled-notifications can gate each send on the
-- recipient's own local hour (see TARGET_LOCAL_HOUR in that function) instead
-- of blasting everyone at the same UTC time regardless of timezone.

select cron.unschedule('daily-push-notifications');

select cron.schedule(
  'hourly-push-notifications',
  '0 * * * *',
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
