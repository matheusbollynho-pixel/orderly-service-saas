-- Corrigir data das transações de pagamento de OS que foram criadas com data errada
-- Você deve executar isso no Supabase SQL Editor
UPDATE cash_flow
SET date = '2026-01-26'
WHERE (description LIKE '%Pagamento OS%' OR description LIKE '%CABO%')
  AND date = '2026-01-27'
  AND created_at::date = '2026-01-26'
  AND type = 'entrada';
