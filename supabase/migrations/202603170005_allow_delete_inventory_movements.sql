-- Permite deletar movimentações (necessário para deletar produtos)
-- Antes: sem política DELETE → RLS bloqueava silenciosamente

CREATE POLICY "Authenticated users can delete inventory_movements"
  ON inventory_movements FOR DELETE TO authenticated USING (true);

-- Troca FK de RESTRICT para CASCADE: deletar produto remove movimentações automaticamente
ALTER TABLE inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_product_id_fkey;

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE CASCADE;
