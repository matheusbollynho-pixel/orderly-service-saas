-- ============================================================
-- Bloqueio de teste grátis vencido / inadimplência nunca rodou:
-- check-trial-expiry foi agendado (20260411003) com current_setting que não
-- existe neste projeto e não está em cron.job; check-overdue-subscriptions
-- nunca foi agendado. Agenda os dois pelo cron_http (segredo + rastreio).
-- 6h05 BRT, antes da loja abrir.
-- ============================================================

select cron.unschedule(jobname) from cron.job
 where jobname in ('check-trial-expiry', 'check-overdue-subscriptions');

select cron.schedule(
  'check-trial-expiry',
  '5 9 * * *',
  $$select public.cron_http('check-trial-expiry', 'check-trial-expiry')$$
);

select cron.schedule(
  'check-overdue-subscriptions',
  '7 9 * * *',
  $$select public.cron_http('check-overdue-subscriptions', 'check-overdue-subscriptions')$$
);
