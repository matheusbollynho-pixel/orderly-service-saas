-- SCRIPT PARA CORRIGIR DATAS DO CASH FLOW

-- 1. VERIFICAR quais pagamentos estão com datas diferentes do cash_flow
SELECT 
  p.id as payment_id,
  DATE(p.created_at) as payment_date,
  cf.date as cash_flow_date,
  cf.description,
  p.amount
FROM payments p
LEFT JOIN cash_flow cf ON cf.payment_id = p.id
WHERE DATE(p.created_at) != cf.date
ORDER BY p.created_at DESC;

-- 2. CORRIGIR as datas (execute depois de verificar acima)
UPDATE cash_flow cf
SET date = DATE(p.created_at)
FROM payments p
WHERE cf.payment_id = p.id
  AND DATE(p.created_at) != cf.date;

-- 3. VERIFICAR se corrigiu
SELECT 
  p.id as payment_id,
  DATE(p.created_at) as payment_date,
  cf.date as cash_flow_date,
  cf.description,
  p.amount
FROM payments p
LEFT JOIN cash_flow cf ON cf.payment_id = p.id
WHERE DATE(p.created_at) != cf.date
ORDER BY p.created_at DESC;
