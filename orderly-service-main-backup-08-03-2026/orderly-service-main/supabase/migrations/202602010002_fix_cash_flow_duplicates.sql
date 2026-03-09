-- Script para limpar duplicatas no cash_flow e manter apenas a entrada com a data correta

-- Quando há duplicatas (mesmo payment_id aparece em múltiplas datas),
-- mantém apenas a entrada cuja data bate com a data do pagamento

DELETE FROM cash_flow cf
WHERE cf.payment_id IS NOT NULL
AND EXISTS (
  -- Verifica se existe uma entrada com a data correta (que bate com o created_at do payment)
  SELECT 1 FROM payments p
  WHERE p.id = cf.payment_id
  AND DATE(p.created_at) != cf.date
);

-- Log: Mostrar quantas entradas ficaram
SELECT 
  'Entradas restantes no cash_flow:' as info,
  COUNT(*) as total,
  COUNT(DISTINCT payment_id) FILTER (WHERE payment_id IS NOT NULL) as pagamentos_unicos
FROM cash_flow;
