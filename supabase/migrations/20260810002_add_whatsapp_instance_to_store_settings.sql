-- ============================================================
-- Colunas de instância de WhatsApp por loja (usadas pelo SuperAdminPage)
-- ============================================================

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS whatsapp_instance_url   TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_instance_token TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_provider       TEXT DEFAULT 'uazapi';
