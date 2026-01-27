-- Adicionar coluna material_id ao cash_flow para rastrear qual material gerou a transação
ALTER TABLE public.cash_flow
ADD COLUMN IF NOT EXISTS material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE;

-- Criar índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_cash_flow_material_id ON cash_flow(material_id);

-- Atualizar função para usar material_id
CREATE OR REPLACE FUNCTION register_material_payment_in_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o material foi marcado como pago, registra no fluxo de caixa
  IF NEW.paid_at IS NOT NULL AND OLD.paid_at IS NULL THEN
    INSERT INTO cash_flow (
      type,
      amount,
      description,
      category,
      payment_method,
      order_id,
      material_id,
      date
    )
    SELECT
      'entrada',
      (NEW.valor * CAST(NEW.quantidade AS NUMERIC))::NUMERIC(10, 2),
      NEW.descricao || ' - Cliente: ' || so.client_name || ' (' || so.equipment || ')',
      CASE WHEN NEW.is_service THEN 'Serviço' ELSE 'Peça' END,
      NEW.payment_method,
      NEW.order_id,
      NEW.id,
      CURRENT_DATE
    FROM service_orders so
    WHERE so.id = NEW.order_id;
  END IF;
  
  -- Se o pagamento foi removido (marca paid_at como NULL)
  IF NEW.paid_at IS NULL AND OLD.paid_at IS NOT NULL THEN
    DELETE FROM cash_flow
    WHERE material_id = NEW.id
    AND type = 'entrada';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Função para deletar do cash_flow quando um material é deletado
CREATE OR REPLACE FUNCTION delete_material_payment_from_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o material tinha paid_at preenchido, remove do cash_flow
  IF OLD.paid_at IS NOT NULL THEN
    DELETE FROM cash_flow
    WHERE material_id = OLD.id
    AND type = 'entrada';
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Recriar trigger para UPDATE
DROP TRIGGER IF EXISTS trigger_register_material_payment_in_cash_flow ON public.materials;

CREATE TRIGGER trigger_register_material_payment_in_cash_flow
  AFTER UPDATE ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION register_material_payment_in_cash_flow();

-- Trigger para DELETE
DROP TRIGGER IF EXISTS trigger_delete_material_payment_from_cash_flow ON public.materials;

CREATE TRIGGER trigger_delete_material_payment_from_cash_flow
  BEFORE DELETE ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION delete_material_payment_from_cash_flow();
