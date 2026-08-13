-- Corrige violação de FK ao restaurar estoque quando uma peça é removida da OS.
--
-- fn_restore_stock_on_material_delete roda AFTER DELETE ON materials e tenta
-- inserir em inventory_movements usando material_id = OLD.id. Só que nesse
-- ponto a linha em materials já foi apagada (é AFTER DELETE), então a FK
-- inventory_movements.material_id -> materials(id) rejeita o insert, e a
-- devolução de estoque nunca acontece (a operação falha).
--
-- Esse bug já tinha sido corrigido em 202603170004 (passando NULL em vez de
-- OLD.id), mas a correção foi perdida quando a função foi recriada depois em
-- 20260408005 (fix store_id) e de novo em scripts/bandara_multitenant_migration.sql
-- (unificação de bancos), ambas voltando a usar OLD.id.

CREATE OR REPLACE FUNCTION fn_restore_stock_on_material_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.product_id IS NOT NULL AND (OLD.is_service IS NULL OR OLD.is_service = false) THEN
    INSERT INTO inventory_movements (store_id, product_id, type, quantity, order_id, material_id, notes)
    VALUES (
      OLD.store_id,
      OLD.product_id,
      'devolucao',
      COALESCE(OLD.quantidade::NUMERIC, 1),
      OLD.order_id,
      NULL, -- material já foi deletado, não pode referenciar (violaria a FK)
      'Devolução automática — material removido da OS'
    );
  END IF;
  RETURN OLD;
END;
$$;
