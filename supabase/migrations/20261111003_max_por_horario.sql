-- Quantas motos a loja aceita no MESMO horário de agendamento (depende de quantos mecânicos tem).
-- 1 = cada moto num horário diferente. O limite por dia (max_agendamentos_dia) continua valendo.
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS max_por_horario int NOT NULL DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE store_settings ADD CONSTRAINT store_settings_max_por_horario_check CHECK (max_por_horario >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
