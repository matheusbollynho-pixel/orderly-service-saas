-- Evita retry infinito de lembretes de manutenção com telefone inválido.
-- Sem isso, um número que nunca vai funcionar (ex: "não está no WhatsApp")
-- fica sendo tentado de novo a cada hora, pra sempre.
ALTER TABLE maintenance_reminders
  ADD COLUMN IF NOT EXISTS reminder_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reminder_last_error TEXT;
