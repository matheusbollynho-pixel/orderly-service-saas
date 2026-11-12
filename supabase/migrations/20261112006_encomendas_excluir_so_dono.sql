-- Só o DONO da loja pode excluir encomenda. Funcionário continua vendo, criando
-- e editando (inclusive marcar desistiu), mas não apaga.

DROP POLICY IF EXISTS "encomendas: membros da loja" ON encomendas;

CREATE POLICY "encomendas: membros leem" ON encomendas FOR SELECT TO authenticated
  USING (store_id = (SELECT get_my_store_id()));
CREATE POLICY "encomendas: membros criam" ON encomendas FOR INSERT TO authenticated
  WITH CHECK (store_id = (SELECT get_my_store_id()));
CREATE POLICY "encomendas: membros editam" ON encomendas FOR UPDATE TO authenticated
  USING (store_id = (SELECT get_my_store_id()))
  WITH CHECK (store_id = (SELECT get_my_store_id()));
CREATE POLICY "encomendas: so dono exclui" ON encomendas FOR DELETE TO authenticated
  USING (
    store_id = (SELECT get_my_store_id())
    AND EXISTS (
      SELECT 1 FROM store_members m
       WHERE m.user_id = auth.uid() AND m.store_id = encomendas.store_id
         AND m.active AND m.role = 'owner'
    )
  );
