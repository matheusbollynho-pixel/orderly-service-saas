-- Tabela de agendamentos da oficina
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dados do cliente (pode ser cadastrado ou avulso)
  client_name    TEXT NOT NULL,
  client_phone   TEXT NOT NULL,
  client_id      UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Moto e serviço
  equipment          TEXT NOT NULL, -- ex: "Honda CG 160 2022"
  service_description TEXT NOT NULL, -- ex: "Revisão completa"

  -- Data e turno
  appointment_date DATE NOT NULL,
  shift TEXT NOT NULL DEFAULT 'manha'
    CHECK (shift IN ('manha', 'tarde', 'dia_todo')),

  -- Status
  status TEXT NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('agendado', 'confirmado', 'cancelado', 'realizado')),

  -- Mecânico designado (opcional)
  mechanic_id UUID REFERENCES mechanics(id) ON DELETE SET NULL,

  -- OS gerada a partir do agendamento (opcional)
  service_order_id UUID REFERENCES service_orders(id) ON DELETE SET NULL,

  notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION update_appointments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_appointments_updated_at();

-- RLS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage appointments"
  ON appointments FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Index para busca por data
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments (appointment_date, shift);
CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments (client_id);
