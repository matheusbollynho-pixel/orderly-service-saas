-- 🧪 TESTE RÁPIDO - Execute este script para diagnosticar o problema

-- ============================================
-- 1. VERIFICAR EXTENSÕES (devem retornar valores)
-- ============================================
SELECT 'EXTENSÕES HABILITADAS:' as check_name;
SELECT extname, extversion FROM pg_extension 
WHERE extname IN ('http', 'pg_cron', 'postgres_fdw', 'pgsodium', 'supabase_vault');

-- ============================================
-- 2. VERIFICAR TRIGGER NO PAYMENTS
-- ============================================
SELECT 'TRIGGERS EM PAYMENTS:' as check_name;
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE event_object_table = 'payments'
ORDER BY trigger_name;

-- ============================================
-- 3. VERIFICAR RPC FUNCTION
-- ============================================
SELECT 'RPC FUNCTION:' as check_name;
SELECT routine_name, routine_type, data_type
FROM information_schema.routines
WHERE routine_name LIKE '%satisfaction%' OR routine_name LIKE '%survey%'
ORDER BY routine_name;

-- ============================================
-- 4. VERIFICAR CRON JOB
-- ============================================
SELECT 'CRON JOB:' as check_name;
SELECT jobid, jobname, schedule, command, active 
FROM cron.job 
WHERE jobname = 'send-satisfaction-survey-daily';

-- ============================================
-- 5. VERIFICAR HISTÓRICO DE EXECUÇÃO DO CRON
-- ============================================
SELECT 'ÚLTIMAS 5 EXECUÇÕES DO CRON:' as check_name;
SELECT 
  (SELECT jobid FROM cron.job WHERE jobname = 'send-satisfaction-survey-daily') as job_id,
  start_time, 
  end_time,
  (end_time - start_time) as duracao,
  status
FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'send-satisfaction-survey-daily')
ORDER BY start_time DESC 
LIMIT 5;

-- ============================================
-- 6. CONTAR PESQUISAS ENVIADAS NOS ÚLTIMOS 7 DIAS
-- ============================================
SELECT 'PESQUISAS ENVIADAS (ÚLTIMOS 7 DIAS):' as check_name;
SELECT 
  COUNT(*) as total_enviadas,
  COUNT(CASE WHEN satisfaction_survey_sent_at > now() - interval '24 hours' THEN 1 END) as ultimas_24h,
  COUNT(CASE WHEN satisfaction_survey_sent_at > now() - interval '1 hour' THEN 1 END) as ultima_hora
FROM service_orders 
WHERE satisfaction_survey_sent_at IS NOT NULL
  AND satisfaction_survey_sent_at > now() - interval '7 days';

-- ============================================
-- 7. LISTAR ORDENS SEM PESQUISA ENVIADA
-- ============================================
SELECT 'ORDENS PENDENTES DE PESQUISA (ÚLTIMOS 2 DIAS):' as check_name;
SELECT 
  so.id,
  so.client_name,
  so.client_phone,
  so.satisfaction_survey_sent_at,
  MAX(p.created_at) as ultimo_pagamento
FROM service_orders so
LEFT JOIN payments p ON p.order_id = so.id
WHERE so.satisfaction_survey_sent_at IS NULL
  AND so.client_phone IS NOT NULL
  AND p.created_at IS NOT NULL
  AND p.created_at > now() - interval '2 days'
GROUP BY so.id, so.client_name, so.client_phone, so.satisfaction_survey_sent_at
ORDER BY MAX(p.created_at) DESC
LIMIT 10;

-- ============================================
-- 8. TESTE MANUAL: CHAMAR RPC DIRETAMENTE
-- ============================================
-- Antes de rodar isto, substitua os valores de xxx
SELECT 'TESTE: Chamando RPC diretamente' as check_name;

-- Primeiro, pegar uma ordem de teste:
-- SELECT id FROM service_orders WHERE client_name ILIKE '%Matheus%' LIMIT 1;
-- Copie o UUID e substitua em 'xxx' no próximo comando:

-- SELECT send_satisfaction_message_rpc(
--   'xxx-seu-uuid-aqui-xxx',
--   '11999999999',
--   'Cliente Teste'
-- ) as rpc_result;

-- ============================================
-- 9. TESTE: VERIFICAR VARIÁVEIS DE CONFIGURAÇÃO
-- ============================================
SELECT 'VARIÁVEIS DE CONFIGURAÇÃO:' as check_name;
SELECT 
  current_setting('app.supabase_url', true) as supabase_url,
  current_setting('app.supabase_service_role_key', true) as service_role_key_exists,
  current_database() as database_name,
  current_user as current_user;
