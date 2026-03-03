-- Corrigir timezone do caixa para usar horário de Paulo Afonso (UTC-3)
-- Problema: CURRENT_DATE estava retornando a data em UTC, não na hora local do Brasil

-- Atualizar a função para usar timezone correto
CREATE OR REPLACE FUNCTION register_payment_in_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM cash_flow WHERE payment_id = NEW.id;

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
    (NEW.created_at AT TIME ZONE 'America/Fortaleza')::date  -- Usar timezone de Paulo Afonso
  FROM service_orders so
  WHERE so.id = NEW.order_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Atualizar trigger para usar a nova função
DROP TRIGGER IF EXISTS trigger_register_payment_in_cash_flow ON payments;

CREATE TRIGGER trigger_register_payment_in_cash_flow
  AFTER INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION register_payment_in_cash_flow();

-- Também atualizar a função sync_payment_to_cash_flow se existir
CREATE OR REPLACE FUNCTION sync_payment_to_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM cash_flow WHERE payment_id = NEW.id;
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
    GREATEST(NEW.amount - COALESCE(NEW.discount_amount, 0), 0),
    'Pagamento OS - ' || so.client_name || ' (' || so.equipment || ')' ||
      CASE WHEN COALESCE(NEW.discount_amount, 0) > 0
        THEN ' [Desc R$ ' || COALESCE(NEW.discount_amount, 0)::text || ']'
        ELSE ''
      END,
    'Ordem de Serviço',
    NEW.method,
    NEW.order_id,
    NEW.id,
    (NEW.created_at AT TIME ZONE 'America/Fortaleza')::date  -- Usar timezone de Paulo Afonso
  FROM service_orders so
  WHERE so.id = NEW.order_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Corrigir todas as datas existentes no cash_flow para usar timezone correto
UPDATE cash_flow cf
SET date = (p.created_at AT TIME ZONE 'America/Fortaleza')::date
FROM payments p
WHERE cf.payment_id = p.id
  AND cf.date != (p.created_at AT TIME ZONE 'America/Fortaleza')::date;

-- Corrigir também as datas de entrada manual se houver (sem payment_id)
UPDATE cash_flow
SET date = (created_at AT TIME ZONE 'America/Fortaleza')::date
WHERE payment_id IS NULL
  AND date != (created_at AT TIME ZONE 'America/Fortaleza')::date;
