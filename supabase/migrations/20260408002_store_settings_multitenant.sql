-- ============================================================
-- STEP 2: store_settings → âncora do multi-tenancy
-- Remove limite de 1 linha, adiciona campos de plano e domínio
-- ============================================================

-- Remove constraint de linha única (se existir)
DROP INDEX IF EXISTS store_settings_single_row;

-- Novos campos
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS subdomain         TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS custom_domain     TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS active            BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS plan              TEXT NOT NULL DEFAULT 'trial'
                             CHECK (plan IN ('trial', 'basic', 'pro', 'enterprise')),
  ADD COLUMN IF NOT EXISTS trial_ends_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS owner_email       TEXT;

-- Atualiza a linha existente (demo) para ter plano
UPDATE store_settings SET plan = 'enterprise', active = true WHERE plan IS NULL OR plan = 'trial';

-- Drop políticas antigas
DROP POLICY IF EXISTS "anon can read settings" ON store_settings;
DROP POLICY IF EXISTS "authenticated can read settings" ON store_settings;
DROP POLICY IF EXISTS "authenticated can upsert settings" ON store_settings;

-- Novas políticas
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;

-- Membro lê sua própria loja
CREATE POLICY "store_settings: member read"
  ON store_settings FOR SELECT TO authenticated
  USING (id = get_my_store_id());

-- Owner/admin pode atualizar
CREATE POLICY "store_settings: owner update"
  ON store_settings FOR UPDATE TO authenticated
  USING (id = get_my_store_id());

-- Anon lê para tela de login (logo, nome da empresa pelo subdomínio)
CREATE POLICY "store_settings: anon read"
  ON store_settings FOR SELECT TO anon
  USING (active = true);

-- SaaS admin vê tudo
CREATE POLICY "store_settings: saas_admin all"
  ON store_settings FOR ALL TO authenticated
  USING (is_saas_admin()) WITH CHECK (is_saas_admin());

-- service_role faz tudo (provisioning)
CREATE POLICY "store_settings: service_role all"
  ON store_settings FOR ALL TO service_role
  USING (true) WITH CHECK (true);
