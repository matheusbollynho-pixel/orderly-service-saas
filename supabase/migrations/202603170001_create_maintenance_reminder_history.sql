-- Migration: cria tabela de histórico de lembretes de manutenção
-- Necessária para evitar 404 no maintenanceReminderService

CREATE TABLE IF NOT EXISTS maintenance_reminder_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_phone   TEXT,
  keyword_id     UUID REFERENCES maintenance_keywords(id) ON DELETE SET NULL,
  action         TEXT NOT NULL CHECK (action IN ('cancelled', 'rescheduled', 'sent')),
  reason         TEXT,
  original_due_date   DATE,
  original_service_date DATE,
  new_due_date        DATE,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminder_history_client_id  ON maintenance_reminder_history(client_id);
CREATE INDEX IF NOT EXISTS idx_reminder_history_keyword_id ON maintenance_reminder_history(keyword_id);
CREATE INDEX IF NOT EXISTS idx_reminder_history_action     ON maintenance_reminder_history(action);

ALTER TABLE maintenance_reminder_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage reminder history"
  ON maintenance_reminder_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
