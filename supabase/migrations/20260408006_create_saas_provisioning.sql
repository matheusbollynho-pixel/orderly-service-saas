-- ============================================================
-- STEP 6: Tabela de assinaturas SaaS
-- Registra cada pagamento e qual store foi criado
-- ============================================================

CREATE TABLE IF NOT EXISTS saas_subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            UUID REFERENCES store_settings(id) ON DELETE SET NULL,
  asaas_payment_id    TEXT UNIQUE,
  asaas_customer_id   TEXT,
  plan                TEXT NOT NULL DEFAULT 'basic',
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'active', 'overdue', 'cancelled')),
  owner_name          TEXT NOT NULL,
  owner_email         TEXT NOT NULL,
  owner_phone         TEXT,
  company_name        TEXT,
  amount              NUMERIC(10,2),
  due_date            DATE,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE saas_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saas_subscriptions: service_role"
  ON saas_subscriptions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "saas_subscriptions: saas_admin"
  ON saas_subscriptions FOR ALL TO authenticated
  USING (is_saas_admin()) WITH CHECK (is_saas_admin());

NOTIFY pgrst, 'reload schema';
