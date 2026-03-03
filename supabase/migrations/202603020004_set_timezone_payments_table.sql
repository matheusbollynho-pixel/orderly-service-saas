-- Definir timezone padrão para o banco de dados usar 'America/Sao_Paulo'
-- Isso garante que o CURRENT_TIMESTAMP use a hora correta de Brasília

-- Primeiro, vamos atualizar a função que cria pagamentos para usar timezone correto
CREATE OR REPLACE FUNCTION sync_payment_to_cash_flow()
RETURNS TRIGGER AS $$
DECLARE
  payment_date DATE;
BEGIN
  -- Calcular a data em timezone de Paulo Afonso
  payment_date := (NEW.created_at AT TIME ZONE 'America/Fortaleza')::date;
  
  -- Remove entrada antiga se existir
  DELETE FROM cash_flow WHERE payment_id = NEW.id;
  
  -- Insere nova entrada com data em timezone correto
  INSERT INTO cash_flow (
    type,
    amount,
    description,
    category,
    payment_method,
    order_id,
    payment_id,
    date,
    created_at
  )
  SELECT
    'entrada',
    NEW.amount,
    'Pagamento OS - ' || so.client_name || ' (' || so.equipment || ')',
    'Ordem de Serviço',
    NEW.method,
    NEW.order_id,
    NEW.id,
    payment_date,
    (NEW.created_at AT TIME ZONE 'America/Fortaleza')
  FROM service_orders so
  WHERE so.id = NEW.order_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recriar triggers para pagamentos
DROP TRIGGER IF EXISTS trigger_payment_insert_cash_flow ON payments;
DROP TRIGGER IF EXISTS trigger_payment_update_cash_flow ON payments;

CREATE TRIGGER trigger_payment_insert_cash_flow
  AFTER INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION sync_payment_to_cash_flow();

CREATE TRIGGER trigger_payment_update_cash_flow
  AFTER UPDATE ON payments
  FOR EACH ROW
  WHEN (
    OLD.created_at IS DISTINCT FROM NEW.created_at 
    OR OLD.amount IS DISTINCT FROM NEW.amount 
    OR OLD.discount_amount IS DISTINCT FROM NEW.discount_amount
    OR OLD.method IS DISTINCT FROM NEW.method
  )
  EXECUTE FUNCTION sync_payment_to_cash_flow();

-- Também atualizar a função register_payment_in_cash_flow para consistência
CREATE OR REPLACE FUNCTION register_payment_in_cash_flow()
RETURNS TRIGGER AS $$
DECLARE
  payment_date DATE;
BEGIN
  payment_date := (NEW.created_at AT TIME ZONE 'America/Fortaleza')::date;

  DELETE FROM cash_flow WHERE payment_id = NEW.id;
  
  INSERT INTO cash_flow (
    type,
    amount,
    description,
    category,
    payment_method,
    order_id,
    payment_id,
    date,
    created_at
  )
  SELECT
    'entrada',
    NEW.amount,
    'Pagamento OS - ' || so.client_name || ' (' || so.equipment || ')',
    'Ordem de Serviço',
    NEW.method,
    NEW.order_id,
    NEW.id,
    payment_date,
    (NEW.created_at AT TIME ZONE 'America/Fortaleza')
  FROM service_orders so
  WHERE so.id = NEW.order_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Corrigir TODAS as entradas existentes do cash_flow com a data correta
UPDATE cash_flow cf
SET date = (cf.created_at AT TIME ZONE 'America/Fortaleza')::date
WHERE payment_id IS NOT NULL
  AND date != (cf.created_at AT TIME ZONE 'America/Fortaleza')::date;

-- Também corrigir entradas sem payment_id (manuais)
UPDATE cash_flow
SET date = (created_at AT TIME ZONE 'America/Fortaleza')::date
WHERE payment_id IS NULL
  AND date != (created_at AT TIME ZONE 'America/Fortaleza')::date;

-- Verificação: mostrar registros ainda incorretos
SELECT id, type, date, created_at, 
       (created_at AT TIME ZONE 'America/Fortaleza')::date as data_correta
FROM cash_flow 
WHERE date != (created_at AT TIME ZONE 'America/Fortaleza')::date
LIMIT 10;
