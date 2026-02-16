-- Enable pg_cron extension
create extension if not exists pg_cron;

-- Create cron job to send satisfaction survey 1 day after payment
-- Runs every day at 10:00 UTC
select cron.schedule(
  'send-satisfaction-survey-daily',
  '0 10 * * *',
  'select
    net.http_post(
      url:=current_setting(''app.supabase_url'') || ''/functions/v1/send-satisfaction-survey'',
      headers:=jsonb_build_object(
        ''Authorization'', ''Bearer '' || current_setting(''app.supabase_service_role_key''),
        ''Content-Type'', ''application/json''
      ),
      body:=jsonb_build_object(''test'', false)::text
    ) as request_id;
  '
);

-- Make sure the job exists and grant permissions
grant execute on function cron.schedule to authenticated;
grant execute on function cron.schedule to service_role;
