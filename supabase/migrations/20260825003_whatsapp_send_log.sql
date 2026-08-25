-- ============================================================
-- Registro de cada envio de WhatsApp por tipo de recurso (satisfação,
-- aniversário, confirmação de agendamento, cobrança de fiado, etc),
-- pra dar visibilidade de "isso aqui tá funcionando de verdade" por
-- loja, não só se a instância está conectada.
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_send_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES store_settings(id) ON DELETE CASCADE,
  feature       TEXT NOT NULL,
  success       BOOLEAN NOT NULL,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_send_log_store_feature ON whatsapp_send_log (store_id, feature, created_at DESC);

ALTER TABLE whatsapp_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_send_log: service_role"
  ON whatsapp_send_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "whatsapp_send_log: saas_admin read"
  ON whatsapp_send_log FOR SELECT TO authenticated
  USING (is_saas_admin());

NOTIFY pgrst, 'reload schema';
