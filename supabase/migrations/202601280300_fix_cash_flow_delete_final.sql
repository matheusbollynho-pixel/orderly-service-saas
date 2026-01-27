-- Solução simples e robusta para deletar do cash_flow quando material é deletado
-- Execute esta query completa no Supabase SQL Editor

-- Atualizar função para registrar pagamentos
CREATE OR REPLACE FUNCTION register_material_payment_in_cash_flow()
RETURNS TRIGGER AS $$
DECLARE
  v_description TEXT;
  v_amount NUMERIC;
BEGIN
  -- Se o material foi marcado como pago (paid_at virou NOT NULL)
  IF NEW.paid_at IS NOT NULL AND OLD.paid_at IS NULL THEN
    SELECT 
      NEW.descricao || ' - Cliente: ' || so.client_name || ' (' || so.equipment || ')',
      (NEW.valor * CAST(NEW.quantidade AS NUMERIC))::NUMERIC(10, 2)
    INTO v_description, v_amount
    FROM service_orders so
    WHERE so.id = NEW.order_id;

    INSERT INTO cash_flow (
      type,
      amount,
      description,
      category,
      payment_method,
      order_id,
      date
    ) VALUES (
      'entrada',
      v_amount,
      v_description,
      CASE WHEN NEW.is_service THEN 'Serviço' ELSE 'Peça' END,
      NEW.payment_method,
      NEW.order_id,
      NEW.paid_at::date
    );
  END IF;
  
  -- Se foi desmarcado como pago (paid_at virou NULL)
  IF NEW.paid_at IS NULL AND OLD.paid_at IS NOT NULL THEN
    DELETE FROM cash_flow
    WHERE order_id = NEW.order_id
    AND type = 'entrada'
    AND description LIKE (NEW.descricao || '%')
    AND date = OLD.paid_at::date;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Função para quando material é deletado
CREATE OR REPLACE FUNCTION delete_material_from_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  -- Deleta do cash_flow se estava marcado como pago
  IF OLD.paid_at IS NOT NULL THEN
    DELETE FROM cash_flow
    WHERE order_id = OLD.order_id
    AND type = 'entrada'
    AND description LIKE (OLD.descricao || '%')
    AND date = OLD.paid_at::date;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Recriar triggers
DROP TRIGGER IF EXISTS trigger_register_material_payment_in_cash_flow ON public.materials;
DROP TRIGGER IF EXISTS trigger_delete_material_payment_from_cash_flow ON public.materials;

CREATE TRIGGER trigger_register_material_payment_in_cash_flow
  AFTER UPDATE ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION register_material_payment_in_cash_flow();

CREATE TRIGGER trigger_delete_material_payment_from_cash_flow
  BEFORE DELETE ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION delete_material_from_cash_flow();
