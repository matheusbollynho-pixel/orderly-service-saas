-- Corrigir função para deletar transações do cash_flow quando material é desfeito o pagamento
-- Esta migration deve ser executada no Supabase

CREATE OR REPLACE FUNCTION register_material_payment_in_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o material foi marcado como pago, registra cada um no fluxo de caixa
  IF NEW.paid_at IS NOT NULL AND OLD.paid_at IS NULL THEN
    INSERT INTO cash_flow (
      type,
      amount,
      description,
      category,
      payment_method,
      order_id,
      date
    )
    SELECT
      'entrada',
      (NEW.valor * CAST(NEW.quantidade AS NUMERIC))::NUMERIC(10, 2),
      NEW.descricao || ' - Cliente: ' || so.client_name || ' (' || so.equipment || ')',
      CASE WHEN NEW.is_service THEN 'Serviço' ELSE 'Peça' END,
      NEW.payment_method,
      NEW.order_id,
      CURRENT_DATE
    FROM service_orders so
    WHERE so.id = NEW.order_id;
  END IF;
  
  -- Se o pagamento foi removido (marked_paid_at virou NULL)
  IF NEW.paid_at IS NULL AND OLD.paid_at IS NOT NULL THEN
    DELETE FROM cash_flow
    WHERE order_id = NEW.order_id
    AND description LIKE (NEW.descricao || '%')
    AND type = 'entrada'
    AND created_at::date = OLD.paid_at::date;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
