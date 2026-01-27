-- Verificar transações recentes e suas datas
SELECT 
  id,
  description,
  date,
  created_at,
  type,
  amount
FROM cash_flow
WHERE description LIKE '%Pagamento OS%'
   OR description LIKE '%CABO%'
ORDER BY created_at DESC
LIMIT 20;
