-- ============================================================
-- O cron 'send-satisfaction-survey-daily' estava quebrado (token sem
-- aspas no comando salvo, faltando vírgula) e falhava silenciosamente
-- todo dia há semanas. Além disso ele chamava send-satisfaction-survey
-- sem order_id, que nessa forma não filtra por loja e usa uma mensagem
-- fixa com o nome "Bandara Motos" — vazando pra clientes de outras lojas.
-- Troca pelo send-satisfaction-bulk, que já processa loja por loja
-- (nome, template e WhatsApp corretos de cada uma).
-- ============================================================

select cron.unschedule('send-satisfaction-survey-daily');

select cron.schedule(
  'send-satisfaction-bulk-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://xqndblstrblqleraepzs.supabase.co/functions/v1/send-satisfaction-bulk',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxbmRibHN0cmJscWxlcmFlcHpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcxOTE2NDM5MiwiZXhwIjoyMDM0NzQwMzkyfQ.9WuSHaSiMwPFvxXIhQC5TnxGMFdKB8u4h7PNmv4B8QA',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('force', false)::text,
    timeout_milliseconds := 20000
  ) as request_id;
  $$
);
