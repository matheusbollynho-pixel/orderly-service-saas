-- Corrige o check constraint do plano para aceitar premium e enterprise
ALTER TABLE store_settings DROP CONSTRAINT IF EXISTS store_settings_plan_check;
ALTER TABLE store_settings ADD CONSTRAINT store_settings_plan_check
  CHECK (plan IN ('trial', 'basic', 'pro', 'premium', 'enterprise'));
