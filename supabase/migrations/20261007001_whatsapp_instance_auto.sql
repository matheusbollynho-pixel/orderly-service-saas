-- ============================================================
-- Marca instância de WhatsApp criada sozinha pela plataforma (botão
-- "Conectar WhatsApp" do dono) vs. cadastrada à mão no SuperAdmin.
-- A limpeza de quem deixou de pagar (check-overdue-subscriptions) só apaga
-- as automáticas — as manuais nunca.
-- ============================================================

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS whatsapp_instance_auto BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
