-- Create maintenance keywords table
CREATE TABLE IF NOT EXISTS maintenance_keywords (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword varchar(255) NOT NULL UNIQUE,
  description text,
  reminder_days integer NOT NULL DEFAULT 90,
  reminder_message text,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create maintenance reminders table
CREATE TABLE IF NOT EXISTS maintenance_reminders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  keyword_id uuid NOT NULL REFERENCES maintenance_keywords(id) ON DELETE CASCADE,
  service_date timestamptz NOT NULL,
  reminder_due_date timestamptz NOT NULL,
  reminder_sent_at timestamptz,
  client_phone varchar(20),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_maintenance_reminders_due_date ON maintenance_reminders(reminder_due_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_reminders_sent_at ON maintenance_reminders(reminder_sent_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_reminders_client ON maintenance_reminders(client_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_keywords_enabled ON maintenance_keywords(enabled);

-- Enable RLS
ALTER TABLE maintenance_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_reminders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for maintenance_keywords (allow authenticated users to read)
CREATE POLICY "Allow authenticated to read keywords"
  ON maintenance_keywords
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated to insert keywords"
  ON maintenance_keywords
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated to update keywords"
  ON maintenance_keywords
  FOR UPDATE
  TO authenticated
  USING (true);

-- RLS Policies for maintenance_reminders (allow authenticated to read/write)
CREATE POLICY "Allow authenticated to read reminders"
  ON maintenance_reminders
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated to insert reminders"
  ON maintenance_reminders
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated to update reminders"
  ON maintenance_reminders
  FOR UPDATE
  TO authenticated
  USING (true);

-- Insert default keywords (you can customize these)
INSERT INTO maintenance_keywords (keyword, description, reminder_days, reminder_message, enabled)
VALUES
  ('Óleo', 'Troca de óleo do motor', 90, 'Olá! Já se passaram {days} dias desde que você trocou o óleo. É hora de fazer a manutenção! 🛢️', true),
  ('Revisão', 'Revisão preventiva da moto', 180, 'Olá! Sua moto está no prazo para revisão preventiva. Agende agora! 🔧', true),
  ('Pneu', 'Troca/Verificação de pneu', 365, 'Olá! É hora de verificar a pressão e condição dos seus pneus. 🛞', true),
  ('Bateria', 'Verificação/Troca de bateria', 365, 'Olá! Faça uma revisão na bateria da sua moto. 🔋', true),
  ('Corrente', 'Limpeza e lubricação da corrente', 90, 'Olá! É hora de limpar e lubrificar a corrente da sua moto. ⛓️', true),
  ('Filtro de Ar', 'Troca de filtro de ar', 180, 'Olá! Seu filtro de ar pode estar saturado. Venha fazer a troca! 💨', true)
ON CONFLICT (keyword) DO NOTHING;
