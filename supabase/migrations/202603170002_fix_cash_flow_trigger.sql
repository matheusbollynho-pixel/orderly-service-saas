-- Corrige trigger fn_register_sale_in_cash_flow
-- Problema: usava coluna 'reference_date' que não existe (coluna correta é 'date')
--           e faltava payment_method (NOT NULL na tabela cash_flow)

CREATE OR REPLACE FUNCTION fn_register_sale_in_cash_flow()
RETURNS TRIGGER AS $$
DECLARE
  v_product_name TEXT;
BEGIN
  IF NEW.type = 'saida_venda' THEN
    SELECT name INTO v_product_name FROM inventory_products WHERE id = NEW.product_id;
    INSERT INTO cash_flow (type, amount, description, category, payment_method, date, notes)
    VALUES (
      'entrada',
      NEW.quantity * COALESCE(NEW.unit_price, 0),
      'Venda avulsa: ' || COALESCE(v_product_name, 'Produto'),
      'Venda Balcão',
      'dinheiro',
      CURRENT_DATE,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- stock_current já aceita negativo no schema (NUMERIC sem CHECK >= 0)
COMMENT ON COLUMN inventory_products.stock_current IS 'Estoque atual — pode ser negativo (vendido a descoberto)';
