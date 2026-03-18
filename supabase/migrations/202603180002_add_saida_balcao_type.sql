-- Adiciona tipo saida_balcao em inventory_movements
-- Objetivo: dar baixa no estoque via Nota de Balcão SEM disparar o trigger
-- que cria entradas individuais no caixa (a nota já cria um lançamento consolidado)

-- 1. Atualiza o CHECK constraint para aceitar saida_balcao
ALTER TABLE inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_type_check;

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_type_check
  CHECK (type IN ('entrada_manual', 'saida_os', 'saida_venda', 'saida_balcao', 'ajuste', 'devolucao'));

-- 2. Atualiza trigger de estoque para dar baixa também em saida_balcao
CREATE OR REPLACE FUNCTION fn_update_stock_on_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type IN ('entrada_manual', 'devolucao', 'ajuste') THEN
    UPDATE inventory_products
      SET stock_current = stock_current + NEW.quantity,
          updated_at = now()
      WHERE id = NEW.product_id;
  ELSIF NEW.type IN ('saida_os', 'saida_venda', 'saida_balcao') THEN
    UPDATE inventory_products
      SET stock_current = stock_current - NEW.quantity,
          updated_at = now()
      WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
