-- Adiciona horário de funcionamento e formas de pagamento à store_settings
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS opening_hours TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_methods TEXT DEFAULT '';
