-- Tabela de boletos
CREATE TABLE IF NOT EXISTS boletos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid REFERENCES store_settings(id) ON DELETE CASCADE NOT NULL,
  credor text NOT NULL,
  valor numeric(10,2) NOT NULL,
  vencimento date NOT NULL,
  codigo_barras text,
  categoria text NOT NULL DEFAULT 'outro'
    CHECK (categoria IN ('fornecedor', 'aluguel', 'conta_fixa', 'imposto', 'outro')),
  recorrencia text NOT NULL DEFAULT 'nenhuma'
    CHECK (recorrencia IN ('nenhuma', 'mensal', 'bimestral', 'trimestral', 'anual')),
  -- Dias de antecedência para alertas: array com 0=no dia, 1=1 dia antes, 3=3 dias antes, etc.
  alert_days integer[] NOT NULL DEFAULT '{3}',
  notify_sistema boolean NOT NULL DEFAULT true,
  notify_whatsapp boolean NOT NULL DEFAULT false,
  observacoes text,
  -- Pagamento
  paid_at date,
  paid_method text CHECK (paid_method IN ('dinheiro', 'pix', 'debito', 'credito', 'ted_doc')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Índices
CREATE INDEX idx_boletos_store_id ON boletos(store_id);
CREATE INDEX idx_boletos_vencimento ON boletos(vencimento);
CREATE INDEX idx_boletos_paid_at ON boletos(paid_at);

-- RLS
ALTER TABLE boletos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "boletos: store members only"
  ON boletos FOR ALL
  USING (
    store_id IN (
      SELECT store_id FROM store_members WHERE user_id = auth.uid()
    )
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_boletos_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER boletos_updated_at
  BEFORE UPDATE ON boletos
  FOR EACH ROW EXECUTE FUNCTION update_boletos_updated_at();

-- Adiciona números de WhatsApp para alertas de boletos em store_settings
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS boleto_notify_phone_1 text,
  ADD COLUMN IF NOT EXISTS boleto_notify_phone_2 text;
