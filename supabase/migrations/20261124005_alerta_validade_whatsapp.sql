-- Alerta de validade no WhatsApp do dono (edge function validade-alertas, 1x por dia).
-- Só lojas que controlam validade têm lote com data, então as outras nunca recebem nada.

-- Liga/desliga por loja (padrão ligado) e "já mandei hoje" (não duplica se o cron rodar 2x)
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS alerta_validade_whatsapp boolean NOT NULL DEFAULT true;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS alerta_validade_enviado_em date;

-- Todo dia 8h05 (Fortaleza, 11h05 UTC). Fora do minuto 8h00, que já roda vários crons.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'validade-alertas-diario';
SELECT cron.schedule(
  'validade-alertas-diario',
  '5 11 * * *',
  $$select public.cron_http('validade-alertas-diario', 'validade-alertas')$$
);

-- Conferência: deve voltar 1 linha com o horário '5 11 * * *'
SELECT jobname, schedule FROM cron.job WHERE jobname = 'validade-alertas-diario';
