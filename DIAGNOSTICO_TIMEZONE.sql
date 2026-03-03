-- Script de diagnóstico: verificar data dos pagamentos e cash_flow
-- Execute isso no Supabase SQL Editor

-- 1. Ver os pagamentos mais recentes com hora UTC e hora de São Paulo
SELECT 
  p.id,
  p.created_at as created_at_utc,
  (p.created_at AT TIME ZONE 'America/Fortaleza') as created_at_pa,
  (p.created_at AT TIME ZONE 'America/Fortaleza')::date as data_pa,
  p.amount,
  p.method
FROM payments p
ORDER BY p.created_at DESC
LIMIT 5;

-- 2. Ver o cash_flow correspondente
SELECT 
  cf.id,
  cf.type,
  cf.amount,
  cf.date as data_caixa,
  cf.created_at as created_at_caixa,
  (cf.created_at AT TIME ZONE 'America/Fortaleza')::date as data_correta,
  p.id as payment_id
FROM cash_flow cf
LEFT JOIN payments p ON cf.payment_id = p.id
ORDER BY cf.created_at DESC
LIMIT 5;

-- 3. Verificar se há discrepâncias
SELECT 
  cf.id,
  cf.date as data_registrada,
  (cf.created_at AT TIME ZONE 'America/Fortaleza')::date as data_deveria_ser,
  cf.description,
  CASE 
    WHEN cf.date != (cf.created_at AT TIME ZONE 'America/Fortaleza')::date 
    THEN 'ERRADO - precisa corrigir'
    ELSE 'OK'
  END as status
FROM cash_flow cf
WHERE cf.date >= CURRENT_DATE - INTERVAL '3 days'
ORDER BY cf.created_at DESC;
