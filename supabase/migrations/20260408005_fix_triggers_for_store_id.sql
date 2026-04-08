-- ============================================================
-- STEP 5: Corrige triggers SECURITY DEFINER para propagar store_id
-- Sem isso os INSERTs automáticos falhariam com NOT NULL violation
-- ============================================================

-- ── register_payment_in_cash_flow ───────────────────────────
CREATE OR REPLACE FUNCTION register_payment_in_cash_flow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO cash_flow (
    store_id, type, amount, description, category,
    payment_method, order_id, payment_id, date
  )
  SELECT
    so.store_id,
    'entrada',
    NEW.amount,
    'Pagamento OS - ' || so.client_name || ' (' || so.equipment || ')',
    'Ordem de Serviço',
    NEW.method,
    NEW.order_id,
    NEW.id,
    CURRENT_DATE
  FROM service_orders so
  WHERE so.id = NEW.order_id;
  RETURN NEW;
END;
$$;

-- ── fn_auto_deduct_stock_on_material ────────────────────────
CREATE OR REPLACE FUNCTION fn_auto_deduct_stock_on_material()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.product_id IS NOT NULL AND (NEW.is_service IS NULL OR NEW.is_service = false) THEN
    INSERT INTO inventory_movements (
      store_id, product_id, type, quantity,
      unit_cost, unit_price, order_id, material_id, notes
    )
    VALUES (
      NEW.store_id,
      NEW.product_id,
      'saida_os',
      COALESCE(NEW.quantidade::NUMERIC, 1),
      NULL,
      NEW.valor,
      NEW.order_id,
      NEW.id,
      'Baixa automática via OS'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ── fn_restore_stock_on_material_delete ─────────────────────
CREATE OR REPLACE FUNCTION fn_restore_stock_on_material_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.product_id IS NOT NULL AND (OLD.is_service IS NULL OR OLD.is_service = false) THEN
    INSERT INTO inventory_movements (
      store_id, product_id, type, quantity,
      order_id, material_id, notes
    )
    VALUES (
      OLD.store_id,
      OLD.product_id,
      'devolucao',
      COALESCE(OLD.quantidade::NUMERIC, 1),
      OLD.order_id,
      OLD.id,
      'Devolução automática — material removido da OS'
    );
  END IF;
  RETURN OLD;
END;
$$;

-- ── fn_register_sale_in_cash_flow ───────────────────────────
CREATE OR REPLACE FUNCTION fn_register_sale_in_cash_flow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_product_name TEXT;
BEGIN
  IF NEW.type = 'saida_venda' THEN
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
