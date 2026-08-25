-- fiado_messages.status agora reflete o resultado real do envio
-- ('sent' | 'failed' | 'skipped'), não mais sempre 'sent' independente
-- do que aconteceu de verdade. error_message guarda o motivo da falha.
ALTER TABLE fiado_messages
  ADD COLUMN IF NOT EXISTS error_message TEXT;
