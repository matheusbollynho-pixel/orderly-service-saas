-- Limpar duplicatas mantendo apenas a entrada cuja data bate com o payment.created_at
WITH duplicates AS (
  SELECT 
    cf.id,
    cf.payment_id,
    cf.date as cash_flow_date,
    DATE(p.created_at) as payment_date,
    ROW_NUMBER() OVER (
      PARTITION BY cf.payment_id 
      ORDER BY 
        CASE WHEN cf.date = DATE(p.created_at) THEN 0 ELSE 1 END,  -- Prioriza a data correta
        cf.id DESC  -- Depois prioriza o mais recente
    ) as rn
  FROM cash_flow cf
  INNER JOIN payments p ON p.id = cf.payment_id
  WHERE cf.payment_id IS NOT NULL
)
DELETE FROM cash_flow
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Adicionar constraint única para payment_id
-- Isso garante que cada payment só pode ter uma entrada no cash_flow
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_flow_payment_unique 
ON cash_flow(payment_id) 
WHERE payment_id IS NOT NULL;

-- Log: Verificar resultado
SELECT 
  'Entradas restantes:' as info,
  COUNT(*) as total_entradas,
  COUNT(DISTINCT payment_id) FILTER (WHERE payment_id IS NOT NULL) as pagamentos_unicos
FROM cash_flow;
