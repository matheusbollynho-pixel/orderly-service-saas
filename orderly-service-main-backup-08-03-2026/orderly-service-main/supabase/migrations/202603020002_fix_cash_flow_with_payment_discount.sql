-- Corrige integração de pagamentos com fluxo de caixa considerando desconto em R$
-- Regra: valor de entrada no caixa = amount - discount_amount

-- 1) Função usada em ambientes com trigger unificado (insert/update)
CREATE OR REPLACE FUNCTION sync_payment_to_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  -- Remove entrada antiga se existir
  DELETE FROM cash_flow WHERE payment_id = NEW.id;

  -- Insere nova entrada com valor líquido (já com desconto)
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
      CASE
        WHEN COALESCE(NEW.discount_amount, 0) > 0
          THEN ' [Desc R$ ' || COALESCE(NEW.discount_amount, 0)::text || ']'
        ELSE ''
      END,
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

-- 2) Função usada em ambientes com trigger antigo (somente insert)
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
    GREATEST(NEW.amount - COALESCE(NEW.discount_amount, 0), 0),
    'Pagamento OS - ' || so.client_name || ' (' || so.equipment || ')' ||
      CASE
        WHEN COALESCE(NEW.discount_amount, 0) > 0
          THEN ' [Desc R$ ' || COALESCE(NEW.discount_amount, 0)::text || ']'
        ELSE ''
      END,
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

-- 3) Garante que alteração de desconto atualize o caixa (ambiente com trigger unificado)
DROP TRIGGER IF EXISTS trigger_payment_update_cash_flow ON payments;
CREATE TRIGGER trigger_payment_update_cash_flow
  AFTER UPDATE ON payments
  FOR EACH ROW
  WHEN (
    OLD.created_at IS DISTINCT FROM NEW.created_at OR
    OLD.amount IS DISTINCT FROM NEW.amount OR
    OLD.discount_amount IS DISTINCT FROM NEW.discount_amount OR
    OLD.method IS DISTINCT FROM NEW.method
  )
  EXECUTE FUNCTION sync_payment_to_cash_flow();

-- 4) Corrige histórico já existente no caixa (somente entradas vinculadas a payment)
UPDATE cash_flow cf
SET
  amount = GREATEST(p.amount - COALESCE(p.discount_amount, 0), 0),
  description = 'Pagamento OS - ' || so.client_name || ' (' || so.equipment || ')' ||
    CASE
      WHEN COALESCE(p.discount_amount, 0) > 0
        THEN ' [Desc R$ ' || COALESCE(p.discount_amount, 0)::text || ']'
      ELSE ''
    END,
  payment_method = p.method,
  order_id = p.order_id,
  date = DATE(p.created_at)
FROM payments p
JOIN service_orders so ON so.id = p.order_id
WHERE cf.payment_id = p.id;
