-- Restaura estoque ao deletar venda do caixa
-- Problema: deletar cash_flow de saida_venda não restaurava o estoque

-- 1. Liga cash_flow ao inventory_movement que o gerou
ALTER TABLE cash_flow
  ADD COLUMN IF NOT EXISTS inventory_movement_id UUID REFERENCES inventory_movements(id) ON DELETE SET NULL;

-- 2. Atualiza o trigger de venda para salvar o vínculo
CREATE OR REPLACE FUNCTION fn_register_sale_in_cash_flow()
RETURNS TRIGGER AS $$
DECLARE
  v_product_name TEXT;
BEGIN
  IF NEW.type = 'saida_venda' THEN
    SELECT name INTO v_product_name FROM inventory_products WHERE id = NEW.product_id;
    INSERT INTO cash_flow (type, amount, description, category, payment_method, date, notes, inventory_movement_id)
    VALUES (
      'entrada',
      NEW.quantity * COALESCE(NEW.unit_price, 0),
      'Venda avulsa: ' || COALESCE(v_product_name, 'Produto'),
      'Venda Balcão',
      'dinheiro',
      CURRENT_DATE,
      NULL,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger: ao deletar cash_flow de venda, cria devolução no estoque
CREATE OR REPLACE FUNCTION fn_restore_stock_on_cashflow_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_mov inventory_movements%ROWTYPE;
BEGIN
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

CREATE OR REPLACE TRIGGER trg_restore_stock_on_cashflow_delete
  BEFORE DELETE ON cash_flow
  FOR EACH ROW EXECUTE FUNCTION fn_restore_stock_on_cashflow_delete();
