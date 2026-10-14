-- ============================================================
-- system-health-check-daily e send-satisfaction-bulk-daily falhavam
-- todo dia desde 20260825: o "body" do net.http_post ia com cast ::text,
-- mas a função espera jsonb (mesmo bug já corrigido no balcao-followup
-- em 20260825005). Reagenda os dois com body jsonb.
--
-- send-satisfaction-bulk virou conta-gotas (1 por loja por chamada, espera
-- sorteada, pula rodadas aleatoriamente, só seg-sáb 8h-19h BRT, teto
-- diário por loja), então o cron passa a rodar a cada 6 min. O acumulado
-- de quando o cron estava quebrado sai aos poucos, nunca em rajada.
-- ============================================================

select cron.unschedule('send-satisfaction-bulk-daily');
select cron.schedule(
  'send-satisfaction-gotejamento',
  '*/6 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xqndblstrblqleraepzs.supabase.co/functions/v1/send-satisfaction-bulk',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <chave legacy removida - desativada; ver 20261014002>',
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
      'Authorization', 'Bearer <chave legacy removida - desativada; ver 20261014002>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) as request_id;
  $$
);
