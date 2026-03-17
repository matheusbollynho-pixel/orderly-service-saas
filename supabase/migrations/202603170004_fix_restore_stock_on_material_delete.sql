-- Corrige fn_restore_stock_on_material_delete
-- Problema: trigger AFTER DELETE tentava inserir inventory_movements com material_id = OLD.id
-- mas o material já foi deletado, violando a FK constraint
-- Fix: passa NULL como material_id (ON DELETE SET NULL já garante isso para rows existentes)

CREATE OR REPLACE FUNCTION fn_restore_stock_on_material_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.product_id IS NOT NULL AND (OLD.is_service IS NULL OR OLD.is_service = false) THEN
    INSERT INTO inventory_movements (product_id, type, quantity, order_id, material_id, notes)
    VALUES (
      OLD.product_id,
      'devolucao',
      COALESCE(OLD.quantidade::NUMERIC, 1),
      OLD.order_id,
      NULL,  -- material já foi deletado, não pode referenciar
      'Devolução automática — material removido da OS'
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
