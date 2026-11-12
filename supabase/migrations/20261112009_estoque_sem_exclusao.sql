-- Estoque: ninguem exclui produto, e o historico de movimentacoes nao pode ser editado nem apagado.
-- Produto que nao vende mais: mudar o status pra "Inativo" ou "Descontinuado".

-- Produtos: ver, cadastrar e editar. Sem DELETE.
DROP POLICY IF EXISTS "inventory_products: store" ON inventory_products;
DROP POLICY IF EXISTS "inventory_products: select" ON inventory_products;
DROP POLICY IF EXISTS "inventory_products: insert" ON inventory_products;
DROP POLICY IF EXISTS "inventory_products: update" ON inventory_products;

CREATE POLICY "inventory_products: select" ON inventory_products FOR SELECT
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));
CREATE POLICY "inventory_products: insert" ON inventory_products FOR INSERT
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));
CREATE POLICY "inventory_products: update" ON inventory_products FOR UPDATE
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- Movimentacoes: so ver e lancar. Corrigir erro = lancar outra movimentacao (ajuste).
DROP POLICY IF EXISTS "inventory_movements: store" ON inventory_movements;
DROP POLICY IF EXISTS "inventory_movements: select" ON inventory_movements;
DROP POLICY IF EXISTS "inventory_movements: insert" ON inventory_movements;

CREATE POLICY "inventory_movements: select" ON inventory_movements FOR SELECT
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));
CREATE POLICY "inventory_movements: insert" ON inventory_movements FOR INSERT
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));
