-- ============================================================
-- A chave JWT "legacy" embutida nos crons foi desativada no projeto: o
-- gateway devolvia 401 (UNAUTHORIZED_LEGACY_JWT) e o cron aparecia como
-- "succeeded" mesmo assim. Troca por um segredo próprio (header
-- x-cron-secret), lido do Vault (nome 'cron_secret') pra não ficar no
-- repo. O mesmo valor fica no secret CRON_SECRET das edge functions.
-- ============================================================

select cron.unschedule('send-satisfaction-gotejamento');
select cron.schedule(
  'send-satisfaction-gotejamento',
  '*/6 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xqndblstrblqleraepzs.supabase.co/functions/v1/send-satisfaction-bulk',
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) as request_id;
  $$
);

select cron.unschedule('system-health-check-daily');
select cron.schedule(
  'system-health-check-daily',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://xqndblstrblqleraepzs.supabase.co/functions/v1/system-health-check',
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) as request_id;
  $$
);
