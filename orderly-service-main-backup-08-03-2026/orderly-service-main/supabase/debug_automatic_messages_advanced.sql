-- 🔍 DEBUGGING AVANÇADO - Use isto quando as soluções básicas não funcionarem

-- ============================================
-- PARTE 1: VERIFICAR EXTENSÕES E PERMISSÕES
-- ============================================

-- Verificar extensões
\echo '=== EXTENSÕES INSTALADAS ==='
SELECT 
  extname, 
  extversion,
  extnamespace::regnamespace as schema,
  extrelocatable
FROM pg_extension 
ORDER BY extname;

-- Verificar se net está disponível
\echo '=== VERIFICAR net.http_post ==='
SELECT 
  n.nspname as schema,
  p.proname,
  p.prokind
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname LIKE 'http%' OR p.proname LIKE '%post%'
ORDER BY n.nspname, p.proname;

-- ============================================
-- PARTE 2: VERIFICAR TRIGGER EM DETALHE
-- ============================================

\echo '=== TRIGGER DETALHES ==='
SELECT 
  t.trigger_name,
  t.event_object_schema,
  t.event_object_table,
  t.event_manipulation,
  t.action_orientation,
  t.action_timing,
  t.action_statement
FROM information_schema.triggers t
WHERE t.event_object_table = 'payments'
ORDER BY t.trigger_name;

-- Ver a função do trigger
\echo '=== FUNÇÃO DO TRIGGER ==='
SELECT 
  p.proname as function_name,
  l.lanname as language,
  p.prosecdef as security_definer,
  p.prokind as kind,
  p.prosrc as source_first_1000_chars
FROM pg_proc p
JOIN pg_language l ON p.prolang = l.oid
WHERE p.proname LIKE '%send_survey%' OR p.proname LIKE '%trigger_payment%'
ORDER BY p.proname;

-- ============================================
-- PARTE 3: VERIFICAR CRON JOB DETALHES
-- ============================================

\echo '=== CRON JOB COMPLETO ==='
SELECT 
  j.jobid,
  j.jobname,
  j.schedule,
  j.command,
  j.nodename,
  j.nodeport,
  j.database,
  j.username,
  j.active,
  j.jobname
FROM cron.job j
WHERE j.jobname LIKE '%satisfaction%' OR j.jobname LIKE '%survey%'
ORDER BY j.jobname;

-- Ver histórico completo de execuções
\echo '=== HISTÓRICO DE EXECUÇÃO DO CRON (ÚLTIMAS 20) ==='
SELECT 
  jr.jobid,
  (SELECT jobname FROM cron.job WHERE jobid = jr.jobid) as job_name,
  jr.start_time,
  jr.end_time,
  EXTRACT(EPOCH FROM (jr.end_time - jr.start_time))::int as duration_seconds,
  jr.status,
  CASE 
    WHEN jr.status = 'succeeded' THEN '✅'
    WHEN jr.status = 'failed' THEN '❌'
    ELSE '⚠️'
  END as result_emoji
FROM cron.job_run_details jr
WHERE jr.jobid IN (SELECT jobid FROM cron.job WHERE jobname LIKE '%satisfaction%')
ORDER BY jr.start_time DESC 
LIMIT 20;

-- ============================================
-- PARTE 4: VERIFICAR PAYMENTS E ORDERS
-- ============================================

\echo '=== ÚLTIMOS 10 PAGAMENTOS ==='
SELECT 
  p.id,
  p.order_id,
  p.amount,
  p.method,
  p.created_at,
  so.client_name,
  so.satisfaction_survey_sent_at,
  CASE 
    WHEN so.satisfaction_survey_sent_at IS NOT NULL THEN '✅ ENVIADO'
    WHEN so.satisfaction_survey_sent_at IS NULL THEN '❌ NÃO ENVIADO'
  END as survey_status,
  (now() - p.created_at) as time_since_payment
FROM payments p
LEFT JOIN service_orders so ON p.order_id = so.id
ORDER BY p.created_at DESC
LIMIT 10;

-- ============================================
-- PARTE 5: ORDENAR POR PROBLEMA
-- ============================================

\echo '=== PAGAMENTOS SEM PESQUISA ENVIADA (ÚLTIMAS 24H) ==='
SELECT 
  p.id,
  p.order_id,
  p.created_at,
  so.client_name,
  so.client_phone,
  so.satisfaction_survey_sent_at,
  (now() - p.created_at) as tempo_desde_pagamento
FROM payments p
LEFT JOIN service_orders so ON p.order_id = so.id
WHERE p.created_at > now() - interval '24 hours'
  AND so.satisfaction_survey_sent_at IS NULL
ORDER BY p.created_at DESC;

-- ============================================
-- PARTE 6: TESTAR net.http_post DIRETAMENTE
-- ============================================

\echo '=== TESTE: Chamar net.http_post para endereço teste ==='
-- Isto vai testar se a função http funciona
-- Se retornar erro de timeout/conexão = rede bloqueada
-- Se retornar JSON = funcionando!
SELECT net.http_post(
  url := 'https://httpbin.org/post',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'User-Agent', 'Supabase-PostgreSQL'
  ),
  body := jsonb_build_object(
    'test', 'from-postgres',
    'timestamp', now()::text
  )::text
) as http_test_response;

-- ============================================
-- PARTE 7: TESTAR RPC FUNCTION MANUALMENTE
-- ============================================

\echo '=== ANTES DE RODAR ISTO, SUBSTITUA xxx_order_id_xxx COM UM UUID DE VERDADE ==='
-- SELECT send_satisfaction_message_rpc(
--   'xxx_order_id_xxx'::uuid,
--   '11999999999',
--   'Cliente Teste'
-- );

-- ============================================
-- PARTE 8: LOGS DO SISTEMA
-- ============================================

\echo '=== VERIFICAR LOGS DO POSTGRESQL ==='
-- Isto mostra erros recentes (últimas 1 hora)
-- Vá em Supabase Dashboard → Logs → Postgres
-- E procure por:
-- - "satisfaction"
-- - "trigger_payment"
-- - "http_post"
-- - "survey"

-- ============================================
-- PARTE 9: ESTATÍSTICAS
-- ============================================

\echo '=== ESTATÍSTICAS GERAIS ==='
SELECT 
  COUNT(*) as total_orders,
  COUNT(CASE WHEN satisfaction_survey_sent_at IS NOT NULL THEN 1 END) as surveys_sent,
  COUNT(CASE WHEN satisfaction_survey_sent_at IS NULL THEN 1 END) as surveys_pending,
  COUNT(CASE WHEN satisfaction_survey_sent_at > now() - interval '24 hours' THEN 1 END) as surveys_last_24h,
  COUNT(CASE WHEN satisfaction_survey_sent_at > now() - interval '1 hour' THEN 1 END) as surveys_last_hour
FROM service_orders
WHERE client_phone IS NOT NULL;

-- ============================================
-- PARTE 10: DIAGNÓSTICO COMPLETO EM UMA CONSULTA
-- ============================================

\echo '=== DIAGNÓSTICO COMPLETO ==='
SELECT 
  'Extensions' as category,
  CASE 
    WHEN COUNT(CASE WHEN extname = 'http' THEN 1 END) > 0 THEN '✅ http'
    ELSE '❌ http FALTANDO'
  END as check1,
  CASE 
    WHEN COUNT(CASE WHEN extname = 'pg_cron' THEN 1 END) > 0 THEN '✅ pg_cron'
    ELSE '❌ pg_cron FALTANDO'
  END as check2
FROM pg_extension
UNION ALL
SELECT 
  'Trigger' as category,
  CASE 
    WHEN EXISTS(
      SELECT 1 FROM information_schema.triggers 
      WHERE event_object_table = 'payments' 
      AND trigger_name LIKE '%survey%'
    ) THEN '✅ Trigger existe'
    ELSE '❌ Trigger não encontrado'
  END as check1,
  CASE 
    WHEN EXISTS(
      SELECT 1 FROM information_schema.routines 
      WHERE routine_name LIKE '%survey%'
    ) THEN '✅ RPC existe'
    ELSE '❌ RPC não encontrada'
  END as check2
UNION ALL
SELECT 
  'Cron' as category,
  CASE 
    WHEN EXISTS(SELECT 1 FROM cron.job WHERE jobname LIKE '%satisfaction%') THEN '✅ Job existe'
    ELSE '❌ Job não encontrado'
  END as check1,
  CASE 
    WHEN (
      SELECT COUNT(*) FROM cron.job_run_details 
      WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'send-satisfaction-survey-daily' LIMIT 1)
      AND status = 'succeeded'
    ) > 0 THEN '✅ Execuções bem-sucedidas'
    ELSE '❌ Nenhuma execução bem-sucedida'
  END as check2;
