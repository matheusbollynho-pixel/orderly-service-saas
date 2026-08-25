-- ============================================================
-- Dois crons achados quebrados pelo novo health-check (falhando
-- silenciosamente todo dia):
--
-- 1) delete-old-checklist-photos: existiam 2 versões da função
--    (delete_old_checklist_photos() e delete_old_checklist_photos(100)
--    com DEFAULT 100), tornando a chamada sem argumento ambígua.
--    Corrigido passando o argumento explícito (mesmo comportamento).
--
-- 2) send-balcao-followup-daily: o "body" do net.http_post estava
--    com cast ::text, mas a função espera jsonb.
-- ============================================================

select cron.unschedule('delete-old-checklist-photos');
select cron.schedule(
  'delete-old-checklist-photos',
  '0 0 * * *',
  'SELECT delete_old_checklist_photos(100);'
);

select cron.unschedule('send-balcao-followup-daily');
select cron.schedule(
  'send-balcao-followup-daily',
  '37 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://xqndblstrblqleraepzs.supabase.co/functions/v1/send-balcao-followup',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('triggered_by', 'cron_job'),
    timeout_milliseconds := 15000
  ) as request_id;
  $$
);
