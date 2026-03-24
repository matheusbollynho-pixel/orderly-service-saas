-- Capacidade máxima de motos por dia na agenda
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS max_agendamentos_dia int NOT NULL DEFAULT 10;
