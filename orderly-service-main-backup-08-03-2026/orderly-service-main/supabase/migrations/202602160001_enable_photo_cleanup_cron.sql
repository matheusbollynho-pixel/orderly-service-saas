-- Ativar limpeza automática de fotos com 100+ dias (Plano Pago)
-- Executa diariamente às 00:00 UTC

-- Remover agendamento anterior se existir
SELECT cron.unschedule('delete-old-checklist-photos') 
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delete-old-checklist-photos');

-- Agendar nova execução diária
SELECT cron.schedule(
  'delete-old-checklist-photos',
  '0 0 * * *',  -- Todos os dias à meia-noite UTC
  'SELECT delete_old_checklist_photos();'
);

-- Verificar se foi criado
SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobname = 'delete-old-checklist-photos';

-- Log do evento
SELECT 'Limpeza automática de fotos ativada' as status;
