-- ============================================================
-- Envios em massa pra cliente agora saem em conta-gotas (_shared/ritmo.ts):
-- poucas mensagens por rodada, com pausa sorteada. O que sobra sai na
-- rodada seguinte, então os crons de rodada única ganham mais rodadas.
--
-- send-balcao-followup: 1x/dia -> de hora em hora, 8h37-17h37 BRT, seg-sáb
-- agendamento-lembrete-dia-anterior: 17h BRT -> 17h, 18h e 19h BRT
-- (ambos marcam o envio no registro, então rodar mais vezes não duplica)
-- ============================================================

select cron.alter_job(
  (select jobid from cron.job where jobname = 'send-balcao-followup-daily'),
  schedule := '37 11-20 * * 1-6'
);

select cron.alter_job(
  (select jobid from cron.job where jobname = 'agendamento-lembrete-dia-anterior'),
  schedule := '0 20,21,22 * * *'
);
