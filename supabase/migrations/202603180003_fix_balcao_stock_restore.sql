-- Ao deletar cash_flow de nota de balcão, restaurar estoque de TODOS os itens
-- Problema: trigger só restaurava saida_venda pelo primeiro inventory_movement_id
-- Solução: adicionar balcao_order_id em inventory_movements e restaurar todos

-- 1. Coluna balcao_order_id em inventory_movements
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS balcao_order_id UUID REFERENCES balcao_orders(id) ON DELETE SET NULL;

-- 2. Atualiza trigger de restauração para cobrir saida_venda E saida_balcao
CREATE OR REPLACE FUNCTION fn_restore_stock_on_cashflow_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_mov inventory_movements%ROWTYPE;
BEGIN
  -- Caso 1: cash_flow de nota de balcão (tem balcao_order_id)
  IF OLD.balcao_order_id IS NOT NULL THEN
    FOR v_mov IN
      SELECT * FROM inventory_movements
      WHERE balcao_order_id = OLD.balcao_order_id
        AND type = 'saida_balcao'
    LOOP
      INSERT INTO inventory_movements (product_id, type, quantity, unit_price, notes, balcao_order_id)
      VALUES (
        v_mov.product_id,
        'devolucao',
        v_mov.quantity,
        v_mov.unit_price,
        'Estorno automático — nota de balcão deletada do caixa',
        OLD.balcao_order_id
      );
    END LOOP;
    RETURN OLD;
  END IF;

  -- Caso 2: venda avulsa simples (saida_venda com inventory_movement_id)
  IF OLD.inventory_movement_id IS NOT NULL THEN
    SELECT * INTO v_mov FROM inventory_movements WHERE id = OLD.inventory_movement_id;
    IF FOUND AND v_mov.type = 'saida_venda' THEN
      INSERT INTO inventory_movements (product_id, type, quantity, unit_price, notes)
      VALUES (
        v_mov.product_id,
        'devolucao',
        v_mov.quantity,
        v_mov.unit_price,
        'Estorno automático — venda deletada do caixa'
      );
    END IF;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
