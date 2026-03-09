-- Corrigir políticas RLS para permitir DELETE em maintenance_keywords
-- Problema: Keywords não estão sendo realmente deletadas do banco

-- Desabilitar RLS temporariamente para verificar
ALTER TABLE maintenance_keywords DISABLE ROW LEVEL SECURITY;

-- Criar política para permitir DELETE
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON maintenance_keywords;

CREATE POLICY "Enable delete for authenticated users"
ON maintenance_keywords
FOR DELETE
TO authenticated
USING (true);

-- Criar política para permitir SELECT
DROP POLICY IF EXISTS "Enable read access for all users" ON maintenance_keywords;

CREATE POLICY "Enable read access for all users"
ON maintenance_keywords
FOR SELECT
TO authenticated
USING (true);

-- Criar política para permitir INSERT
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON maintenance_keywords;

CREATE POLICY "Enable insert for authenticated users"
ON maintenance_keywords
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Criar política para permitir UPDATE
DROP POLICY IF EXISTS "Enable update for authenticated users" ON maintenance_keywords;

CREATE POLICY "Enable update for authenticated users"
ON maintenance_keywords
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Reabilitar RLS
ALTER TABLE maintenance_keywords ENABLE ROW LEVEL SECURITY;

-- Verificar políticas criadas
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'maintenance_keywords';
