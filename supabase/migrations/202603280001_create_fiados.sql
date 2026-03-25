-- Tabela principal de fiados
CREATE TABLE IF NOT EXISTS fiados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_type TEXT NOT NULL DEFAULT 'manual' CHECK (origin_type IN ('os', 'balcao', 'manual')),
  origin_id TEXT,
  client_name TEXT NOT NULL,
  client_phone TEXT,
  client_cpf TEXT,
  client_id UUID,
  items JSONB DEFAULT '[]',
  original_amount NUMERIC NOT NULL DEFAULT 0,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  interest_accrued NUMERIC NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  interest_rate_monthly NUMERIC NOT NULL DEFAULT 2.0,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'parcial', 'pago', 'juridico')),
  last_reminder_level INTEGER DEFAULT 0,
  last_reminder_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fiado_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiado_id UUID NOT NULL REFERENCES fiados(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  method TEXT DEFAULT 'dinheiro',
  notes TEXT,
  received_by TEXT,
  paid_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fiado_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiado_id UUID NOT NULL REFERENCES fiados(id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'sent'
);

-- RLS
ALTER TABLE fiados ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiado_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiado_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fiados_all" ON fiados FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "fiado_payments_all" ON fiado_payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "fiado_messages_all" ON fiado_messages FOR ALL USING (true) WITH CHECK (true);
