-- Enable pg_cron extension
create extension if not exists pg_cron with schema extensions;

-- Enable http extension needed for net.http_post
create extension if not exists http with schema extensions;

-- Create cron job to send satisfaction survey 1 day after payment
-- Runs every day at 08:00 UTC (more reliable time)
select cron.schedule(
  'send-satisfaction-survey-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://xqndblstrblqleraepzs.supabase.co/functions/v1/send-satisfaction-survey',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'test', false,
      'triggered_by', 'cron_job'
    )::text,
    timeout_milliseconds := 10000
  ) as request_id;
  $$
);

-- Grant permissions
grant execute on function cron.schedule to authenticated;
grant execute on function cron.schedule to service_role;

-- Verify the job was created
select * from cron.job where jobname = 'send-satisfaction-survey-daily';
