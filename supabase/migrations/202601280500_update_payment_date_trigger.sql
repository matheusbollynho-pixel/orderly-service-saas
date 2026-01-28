-- Trigger para atualizar a data no cash_flow quando a data do pagamento é alterada

CREATE OR REPLACE FUNCTION update_payment_date_in_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  -- Se a data do pagamento foi alterada, atualiza no cash_flow
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    UPDATE cash_flow
    SET date = DATE(NEW.created_at)
    WHERE payment_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para atualizar quando payment é modificado
DROP TRIGGER IF EXISTS trigger_update_payment_date_in_cash_flow ON payments;

CREATE TRIGGER trigger_update_payment_date_in_cash_flow
  AFTER UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_date_in_cash_flow();
