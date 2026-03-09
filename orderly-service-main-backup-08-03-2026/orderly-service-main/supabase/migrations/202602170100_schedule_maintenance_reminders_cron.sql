-- Schedule maintenance reminder checker to run daily at 8:00 UTC
-- This will check for maintenance reminders that are due and send WhatsApp messages

-- Note: pg_cron must already be enabled
SELECT cron.schedule(
  'check_maintenance_reminders_daily',
  '0 8 * * *',
  'SELECT net.http_post(
    url := ''https://xqndblstrblqleraepzs.supabase.co/functions/v1/check-maintenance-reminders'',
    headers := jsonb_build_object(
      ''Content-Type'', ''application/json'',
      ''Authorization'', ''Bearer '' || current_setting(''app.settings.supabase_key'', true)
    ),
    body := jsonb_build_object()::text
  ) as request_id;'
);
