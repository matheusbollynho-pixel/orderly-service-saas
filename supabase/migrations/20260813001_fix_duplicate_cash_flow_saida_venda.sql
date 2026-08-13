-- Corrige duplicação de "Venda avulsa" no caixa.
--
-- A tela de Caixa (CashFlowPage, lançamento de entrada vinculado a um produto)
-- já cria a movimentação de estoque (saida_venda) E insere manualmente a
-- entrada em cash_flow vinculada via inventory_movement_id (isso é o que
-- permite estornar o estoque quando a venda é cancelada/deletada).
--
-- A trigger fn_register_sale_in_cash_flow, criada antes desse fluxo existir,
-- insere uma SEGUNDA entrada automática pra toda movimentação 'saida_venda',
-- duplicando o valor em "Transações do Dia". Ela continua necessária pra tela
-- de Estoque (Nova Movimentação > Venda avulsa), que não cria a entrada
-- manualmente e depende só da trigger.
--
-- Solução: flag que só quem já tratou o lançamento do caixa marca, pra trigger
-- pular. Não mexe na trigger de estorno/devolução de estoque.

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS skip_cash_flow_trigger BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION fn_register_sale_in_cash_flow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_product_name TEXT;
BEGIN
  IF NEW.type = 'saida_venda' AND NOT NEW.skip_cash_flow_trigger THEN
    SELECT name INTO v_product_name FROM inventory_products WHERE id = NEW.product_id;
    INSERT INTO cash_flow (store_id, type, amount, description, date)
    VALUES (
      NEW.store_id,
      'entrada',
      NEW.quantity * COALESCE(NEW.unit_price, 0),
      'Venda avulsa: ' || COALESCE(v_product_name, 'Produto'),
      CURRENT_DATE
    );
  END IF;
  RETURN NEW;
END;
$$;
