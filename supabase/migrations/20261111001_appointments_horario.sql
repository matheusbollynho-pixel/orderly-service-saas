-- Horário opcional no agendamento (ex: 09:30). O turno continua existindo
-- e é derivado do horário quando ele é informado (antes de 12h = manhã).
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS appointment_time TIME;

CREATE INDEX IF NOT EXISTS idx_appointments_date_time
  ON appointments (store_id, appointment_date, appointment_time);
