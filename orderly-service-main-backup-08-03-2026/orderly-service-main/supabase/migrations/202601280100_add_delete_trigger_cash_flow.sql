-- Adicionar trigger de DELETE para remover do cash_flow quando material é deletado
-- Execute esta query no Supabase SQL Editor

-- Função para deletar do cash_flow quando um material é deletado
CREATE OR REPLACE FUNCTION delete_material_payment_from_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o material tinha paid_at preenchido, remove do cash_flow
  IF OLD.paid_at IS NOT NULL THEN
    DELETE FROM cash_flow
    WHERE order_id = OLD.order_id
    AND description LIKE (OLD.descricao || '%')
    AND type = 'entrada';
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para deletar quando o material é removido
DROP TRIGGER IF EXISTS trigger_delete_material_payment_from_cash_flow ON public.materials;

CREATE TRIGGER trigger_delete_material_payment_from_cash_flow
  BEFORE DELETE ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION delete_material_payment_from_cash_flow();
