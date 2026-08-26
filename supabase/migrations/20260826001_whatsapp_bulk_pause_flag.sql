-- Permite pausar manualmente os envios automáticos em massa de WhatsApp
-- de uma loja específica (lembrete de manutenção, satisfação, fiado,
-- aniversário) sem afetar as outras lojas. Usado quando o WhatsApp da
-- loja está suspenso/instável e não deve receber tentativas de envio
-- até o dono confirmar que reconectou.
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS whatsapp_bulk_paused BOOLEAN NOT NULL DEFAULT false;
