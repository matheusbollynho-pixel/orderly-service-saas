-- ============================================================
-- is_saas_admin() passa a reconhecer a tabela super_admins
-- ============================================================
-- O app libera o /superadmin pela tabela super_admins (useSuperAdmin),
-- mas as policies "saas_admin all" usam is_saas_admin(), que só olhava
-- raw_user_meta_data.is_saas_admin. Quem estava só na tabela entrava na
-- tela, mas todo UPDATE alterava 0 linhas em silêncio (ex.: trocar plano
-- da BAMOTOS em 19/10/2026 não gravou). Mantém o critério antigo também.

CREATE OR REPLACE FUNCTION is_saas_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM auth.users
        WHERE id = auth.uid()
          AND raw_user_meta_data->>'is_saas_admin' = 'true'
      );
$$;
