-- Corrigir trigger para usar a data correta do pagamento ao criar entrada no cash_flow
-- Agora com UPSERT para evitar duplicatas

CREATE OR REPLACE FUNCTION register_payment_in_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  -- Buscar informações da ordem e registrar com a data do pagamento
  -- Usa INSERT ON CONFLICT para evitar duplicatas
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
    DATE(NEW.created_at)  -- Usar a data do pagamento, não CURRENT_DATE
  FROM service_orders so
  WHERE so.id = NEW.order_id
  ON CONFLICT (payment_id) 
  WHERE payment_id IS NOT NULL
  DO UPDATE SET
    date = EXCLUDED.date,
    amount = EXCLUDED.amount,
    description = EXCLUDED.description,
    payment_method = EXCLUDED.payment_method;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recriar o trigger
DROP TRIGGER IF EXISTS trigger_register_payment_in_cash_flow ON payments;

CREATE TRIGGER trigger_register_payment_in_cash_flow
  AFTER INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION register_payment_in_cash_flow();
