-- ============================================================
-- Medição de uso de IA por loja, pra permitir cobrar excedente
-- ou sugerir upgrade de plano no futuro. Sem bloqueio automático
-- por enquanto — só registro + visibilidade no SuperAdmin.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES store_settings(id) ON DELETE CASCADE,
  function_name TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_store_month ON ai_usage_log (store_id, created_at);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_log: service_role"
  ON ai_usage_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "ai_usage_log: saas_admin read"
  ON ai_usage_log FOR SELECT TO authenticated
  USING (is_saas_admin());

-- Limite mensal de chamadas de IA incluído no plano. NULL = usa o
-- default do plano (definido no código do SuperAdmin), não um
-- valor fixo por loja.
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS ai_monthly_limit INTEGER;

NOTIFY pgrst, 'reload schema';
