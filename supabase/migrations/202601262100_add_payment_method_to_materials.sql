-- Adicionar campo payment_method à tabela de materiais
ALTER TABLE public.materials
ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('dinheiro', 'pix', 'credito', 'debito', 'transferencia', 'outro'));

-- Atualizar função para registrar cada item individual no fluxo de caixa
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
  
  -- Se o pagamento foi removido
  IF NEW.paid_at IS NULL AND OLD.paid_at IS NOT NULL THEN
    DELETE FROM cash_flow
    WHERE description LIKE (NEW.descricao || '%')
    AND order_id = NEW.order_id
    AND type = 'entrada';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para registrar cada material como pagamento
DROP TRIGGER IF EXISTS trigger_register_material_payment_in_cash_flow ON public.materials;

CREATE TRIGGER trigger_register_material_payment_in_cash_flow
  AFTER UPDATE ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION register_material_payment_in_cash_flow();

-- Comentário explicativo
COMMENT ON COLUMN public.materials.payment_method IS 'Forma de pagamento do item: dinheiro, pix, credito, debito, transferencia ou outro';
