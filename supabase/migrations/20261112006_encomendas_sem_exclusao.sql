-- Encomenda NUNCA é apagada (nem pelo dono): fica o histórico completo,
-- inclusive de quem desistiu e o motivo. Membros veem, criam e editam;
-- não existe política de DELETE, então o banco recusa qualquer exclusão.

DROP POLICY IF EXISTS "encomendas: membros da loja" ON encomendas;
DROP POLICY IF EXISTS "encomendas: so dono exclui" ON encomendas;

DROP POLICY IF EXISTS "encomendas: membros leem" ON encomendas;
CREATE POLICY "encomendas: membros leem" ON encomendas FOR SELECT TO authenticated
  USING (store_id = (SELECT get_my_store_id()));
DROP POLICY IF EXISTS "encomendas: membros criam" ON encomendas;
CREATE POLICY "encomendas: membros criam" ON encomendas FOR INSERT TO authenticated
  WITH CHECK (store_id = (SELECT get_my_store_id()));
DROP POLICY IF EXISTS "encomendas: membros editam" ON encomendas;
CREATE POLICY "encomendas: membros editam" ON encomendas FOR UPDATE TO authenticated
  USING (store_id = (SELECT get_my_store_id()))
  WITH CHECK (store_id = (SELECT get_my_store_id()));
