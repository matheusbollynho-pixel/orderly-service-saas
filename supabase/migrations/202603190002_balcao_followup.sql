-- Adiciona coluna para controle de envio do pós-venda do balcão
ALTER TABLE balcao_orders
  ADD COLUMN IF NOT EXISTS follow_up_sent_at TIMESTAMPTZ;

-- Cron job: roda todo dia às 12:37 UTC (09:37 horário de Brasília)
-- Busca notas de balcão finalizadas há 24h+ que ainda não receberam follow-up
SELECT cron.schedule(
  'send-balcao-followup-daily',
  '37 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://xqndblstrblqleraepzs.supabase.co/functions/v1/send-balcao-followup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('triggered_by', 'cron_job')::text,
    timeout_milliseconds := 15000
  ) as request_id;
  $$
);
