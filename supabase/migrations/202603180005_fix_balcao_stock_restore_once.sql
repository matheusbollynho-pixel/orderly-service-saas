-- Corrige restauração de estoque duplicada ao deletar múltiplas entradas de caixa
-- da mesma nota de balcão. Agora só restaura quando é a ÚLTIMA entrada deletada.

CREATE OR REPLACE FUNCTION fn_restore_stock_on_cashflow_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_mov inventory_movements%ROWTYPE;
  v_remaining INT;
BEGIN
  -- Caso 1: cash_flow de nota de balcão (tem balcao_order_id)
  IF OLD.balcao_order_id IS NOT NULL THEN
    -- Verifica se ainda existem outras entradas deste balcão no caixa
    SELECT COUNT(*) INTO v_remaining
    FROM cash_flow
    WHERE balcao_order_id = OLD.balcao_order_id
      AND id != OLD.id;

    -- Só restaura o estoque quando for a última entrada sendo deletada
    IF v_remaining = 0 THEN
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
    END IF;
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
