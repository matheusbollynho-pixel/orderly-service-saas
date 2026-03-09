-- DIAGNÓSTICO COMPLETO - Execute este SQL no Supabase

-- 1. Ver TODOS os pagamentos dos últimos 3 dias
SELECT 
  p.id,
  p.created_at,
  DATE(p.created_at) as data_pagamento,
  p.amount as valor,
  p.method as forma,
  so.client_name as cliente
FROM payments p
LEFT JOIN service_orders so ON so.id = p.order_id
WHERE p.created_at >= NOW() - INTERVAL '3 days'
ORDER BY p.created_at DESC;

-- 2. Ver TODOS os registros do cash_flow dos últimos 3 dias
SELECT 
  id,
  date as data_caixa,
  created_at,
  description,
  amount as valor,
  type as tipo,
  payment_id
FROM cash_flow
WHERE date >= CURRENT_DATE - INTERVAL '3 days'
ORDER BY date DESC, created_at DESC;

-- 3. Ver pagamentos COM e SEM correspondência no cash_flow
SELECT 
  p.id as payment_id,
  DATE(p.created_at) as payment_date,
  p.amount,
  so.client_name,
  cf.id as cash_flow_id,
  cf.date as cash_flow_date,
  CASE 
    WHEN cf.id IS NULL THEN 'SEM REGISTRO NO CAIXA'
    WHEN DATE(p.created_at) != cf.date THEN 'DATA DIFERENTE'
    ELSE 'OK'
  END as status
FROM payments p
LEFT JOIN service_orders so ON so.id = p.order_id
LEFT JOIN cash_flow cf ON cf.payment_id = p.id
WHERE p.created_at >= NOW() - INTERVAL '3 days'
ORDER BY p.created_at DESC;
