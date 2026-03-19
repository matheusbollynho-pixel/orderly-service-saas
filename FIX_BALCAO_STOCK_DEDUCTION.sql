-- ============================================================
-- FIX: Baixa de estoque na Nota de Balcão
-- Execute no Supabase Studio > SQL Editor
-- É idempotente: pode rodar mais de uma vez sem problema.
-- ============================================================

-- 1. Adiciona saida_balcao ao CHECK constraint de inventory_movements
ALTER TABLE inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_type_check;

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_type_check
  CHECK (type IN ('entrada_manual', 'saida_os', 'saida_venda', 'saida_balcao', 'ajuste', 'devolucao'));

-- 2. Coluna balcao_order_id em inventory_movements (para rastrear e restaurar)
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS balcao_order_id UUID REFERENCES balcao_orders(id) ON DELETE SET NULL;

-- 3. Atualiza trigger de estoque para dar baixa em saida_balcao também
CREATE OR REPLACE FUNCTION fn_update_stock_on_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type IN ('entrada_manual', 'devolucao') THEN
    UPDATE inventory_products
      SET stock_current = stock_current + NEW.quantity,
          updated_at = now()
      WHERE id = NEW.product_id;
  ELSIF NEW.type IN ('saida_os', 'saida_venda', 'saida_balcao') THEN
    UPDATE inventory_products
      SET stock_current = stock_current - NEW.quantity,
          updated_at = now()
      WHERE id = NEW.product_id;
  ELSIF NEW.type = 'ajuste' THEN
    UPDATE inventory_products
      SET stock_current = NEW.quantity,
          updated_at = now()
      WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Restaura estoque ao deletar lançamento de balcão do caixa
--    (só restaura quando for o último lançamento daquela nota)
CREATE OR REPLACE FUNCTION fn_restore_stock_on_cashflow_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_mov inventory_movements%ROWTYPE;
  v_remaining INT;
BEGIN
  -- Caso 1: lançamento de nota de balcão
  IF OLD.balcao_order_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_remaining
    FROM cash_flow
    WHERE balcao_order_id = OLD.balcao_order_id
      AND id != OLD.id;

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

  -- Caso 2: venda avulsa do estoque
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

-- Garante que o trigger de restauração existe no cash_flow
DROP TRIGGER IF EXISTS trg_restore_stock_on_cashflow_delete ON cash_flow;
CREATE TRIGGER trg_restore_stock_on_cashflow_delete
  BEFORE DELETE ON cash_flow
  FOR EACH ROW EXECUTE FUNCTION fn_restore_stock_on_cashflow_delete();
