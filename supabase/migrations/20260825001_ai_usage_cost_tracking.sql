-- ============================================================
-- Custo real de IA por loja, em vez de só contar chamadas.
-- Guarda tokens + custo em USD de cada chamada, e um orçamento
-- mensal em R$ por loja (NULL = usa o default do plano).
-- ============================================================

ALTER TABLE ai_usage_log
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS input_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS output_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(10,6);

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS ai_monthly_budget_brl NUMERIC(10,2);

NOTIFY pgrst, 'reload schema';
