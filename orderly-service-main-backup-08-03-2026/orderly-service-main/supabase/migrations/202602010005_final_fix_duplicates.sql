-- SOLUÇÃO DEFINITIVA: Remover todos os triggers e recriar do zero

-- PASSO 1: Remover TODOS os triggers de payments
DO $$ 
DECLARE 
  r RECORD;
BEGIN
  FOR r IN (SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'payments') LOOP
    EXECUTE 'DROP TRIGGER IF EXISTS ' || r.trigger_name || ' ON payments';
  END LOOP;
END $$;

-- PASSO 2: Limpar TODAS as duplicatas
WITH ranked AS (
  SELECT 
    cf.id,
    ROW_NUMBER() OVER (PARTITION BY cf.payment_id ORDER BY cf.id DESC) as rn
  FROM cash_flow cf
  WHERE cf.payment_id IS NOT NULL
)
DELETE FROM cash_flow
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- PASSO 3: Remover constraint única se existir
DROP INDEX IF EXISTS idx_cash_flow_payment_unique;

-- PASSO 4: Criar função UNIFICADA para INSERT e UPDATE
CREATE OR REPLACE FUNCTION sync_payment_to_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  -- Remove entrada antiga se existir
  DELETE FROM cash_flow WHERE payment_id = NEW.id;
  
  -- Insere nova entrada com data correta
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

-- PASSO 5: Criar trigger para INSERT
CREATE TRIGGER trigger_payment_insert_cash_flow
  AFTER INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION sync_payment_to_cash_flow();

-- PASSO 6: Criar trigger para UPDATE
CREATE TRIGGER trigger_payment_update_cash_flow
  AFTER UPDATE ON payments
  FOR EACH ROW
  WHEN (OLD.created_at IS DISTINCT FROM NEW.created_at OR OLD.amount IS DISTINCT FROM NEW.amount OR OLD.method IS DISTINCT FROM NEW.method)
  EXECUTE FUNCTION sync_payment_to_cash_flow();

-- PASSO 7: Criar trigger para DELETE
CREATE OR REPLACE FUNCTION remove_payment_from_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM cash_flow WHERE payment_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_payment_delete_cash_flow
  BEFORE DELETE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION remove_payment_from_cash_flow();

-- PASSO 8: Verificar resultado
SELECT 
  'Triggers ativos:' as info,
  trigger_name,
  event_manipulation,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'payments'
ORDER BY trigger_name;

-- Verificar duplicatas
SELECT 
  'Duplicatas no cash_flow:' as info,
  payment_id,
  COUNT(*) as quantidade
FROM cash_flow
WHERE payment_id IS NOT NULL
GROUP BY payment_id
HAVING COUNT(*) > 1;
