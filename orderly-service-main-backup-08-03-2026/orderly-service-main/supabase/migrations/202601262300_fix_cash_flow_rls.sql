-- Desabilitar RLS temporariamente para cash_flow para permitir acesso
ALTER TABLE cash_flow DISABLE ROW LEVEL SECURITY;

-- Recrear policies mais simples
CREATE POLICY "Enable all access for authenticated users"
  ON cash_flow FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
