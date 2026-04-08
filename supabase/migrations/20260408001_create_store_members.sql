-- ============================================================
-- STEP 1: store_members + helper functions
-- Liga auth.uid() → store_id para toda a RLS
-- ============================================================

CREATE TABLE IF NOT EXISTS store_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID NOT NULL REFERENCES store_settings(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'owner'
               CHECK (role IN ('owner', 'admin', 'mechanic', 'receptionist')),
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (store_id, user_id)
);

ALTER TABLE store_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_members: self read"
  ON store_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "store_members: service_role all"
  ON store_members FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Função principal: retorna o store_id do usuário logado
CREATE OR REPLACE FUNCTION get_my_store_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT store_id
  FROM store_members
  WHERE user_id = auth.uid()
    AND active = true
  LIMIT 1;
$$;

-- Função para checar se é admin do SaaS (dono do sistema)
CREATE OR REPLACE FUNCTION is_saas_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND raw_user_meta_data->>'is_saas_admin' = 'true'
  );
$$;
