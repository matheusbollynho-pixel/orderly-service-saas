-- PASSO 1: Remover TODOS os triggers de pagamento antigos
DROP TRIGGER IF EXISTS trigger_register_payment_in_cash_flow ON payments;
DROP TRIGGER IF EXISTS trigger_remove_payment_from_cash_flow ON payments;

-- PASSO 2: Limpar todas as duplicatas do cash_flow
-- Remove duplicatas mantendo apenas uma entrada por payment_id
WITH ranked AS (
  SELECT 
    cf.id,
    cf.payment_id,
    ROW_NUMBER() OVER (
      PARTITION BY cf.payment_id 
      ORDER BY 
        CASE WHEN cf.date = DATE(p.created_at) THEN 0 ELSE 1 END,
        cf.id DESC
    ) as rn
  FROM cash_flow cf
  LEFT JOIN payments p ON p.id = cf.payment_id
  WHERE cf.payment_id IS NOT NULL
)
DELETE FROM cash_flow
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- PASSO 3: Garantir constraint única (se não existir)
DROP INDEX IF EXISTS idx_cash_flow_payment_unique;
CREATE UNIQUE INDEX idx_cash_flow_payment_unique 
ON cash_flow(payment_id) 
WHERE payment_id IS NOT NULL;

-- PASSO 4: Recriar APENAS o trigger de INSERT com verificação manual
CREATE OR REPLACE FUNCTION register_payment_in_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  -- Primeiro, remove qualquer entrada existente deste payment_id
  DELETE FROM cash_flow WHERE payment_id = NEW.id;
  
  -- Depois, insere a nova entrada
  INSERT INTO cash_flow (
    type,
    amount,
    description,
    category,
    payment_method,
    order_id,
    payment_id,
    date
  )
  SELECT
    'entrada',
    NEW.amount,
    'Pagamento OS - ' || so.client_name || ' (' || so.equipment || ')',
    'Ordem de Serviço',
    NEW.method,
    NEW.order_id,
    NEW.id,
    DATE(NEW.created_at)
  FROM service_orders so
  WHERE so.id = NEW.order_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_register_payment_in_cash_flow
  AFTER INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION register_payment_in_cash_flow();

-- PASSO 5: Recriar trigger de DELETE
CREATE OR REPLACE FUNCTION remove_payment_from_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM cash_flow WHERE payment_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_remove_payment_from_cash_flow
  BEFORE DELETE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION remove_payment_from_cash_flow();

-- PASSO 6: Verificar resultado
SELECT 
  'Resultado:' as info,
  COUNT(*) as total_entradas,
  COUNT(DISTINCT payment_id) FILTER (WHERE payment_id IS NOT NULL) as pagamentos_unicos,
  COUNT(*) - COUNT(DISTINCT payment_id) FILTER (WHERE payment_id IS NOT NULL) as possíveis_duplicatas
FROM cash_flow;
