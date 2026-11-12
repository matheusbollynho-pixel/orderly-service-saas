-- OS que ja recebeu dinheiro nao pode ser excluida (anti ma-fe).
-- Pra corrigir: estornar os pagamentos (fica registrado no caixa com motivo) e depois excluir.
CREATE OR REPLACE FUNCTION bloquear_exclusao_os_com_pagamento()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM payments WHERE order_id = OLD.id)
     OR EXISTS (SELECT 1 FROM materials WHERE order_id = OLD.id AND paid_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Essa OS tem pagamento. Estorne os pagamentos antes de excluir.';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_bloquear_exclusao_os_com_pagamento ON service_orders;
CREATE TRIGGER trg_bloquear_exclusao_os_com_pagamento
  BEFORE DELETE ON service_orders
  FOR EACH ROW EXECUTE FUNCTION bloquear_exclusao_os_com_pagamento();
