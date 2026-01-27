-- Criar tabela de fluxo de caixa
CREATE TABLE IF NOT EXISTS cash_flow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('entrada', 'saida', 'retirada')),
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  category TEXT,
  payment_method TEXT CHECK (payment_method IN ('dinheiro', 'pix', 'credito', 'debito', 'transferencia', 'outro')),
  order_id UUID REFERENCES service_orders(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT
);

-- Índices para melhorar performance
CREATE INDEX idx_cash_flow_date ON cash_flow(date DESC);
CREATE INDEX idx_cash_flow_type ON cash_flow(type);
CREATE INDEX idx_cash_flow_order ON cash_flow(order_id);
CREATE INDEX idx_cash_flow_payment ON cash_flow(payment_id);

-- RLS Policies
ALTER TABLE cash_flow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura para todos usuários autenticados"
  ON cash_flow FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Permitir inserção para usuários autenticados"
  ON cash_flow FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Permitir atualização para usuários autenticados"
  ON cash_flow FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Permitir exclusão para usuários autenticados"
  ON cash_flow FOR DELETE
  TO authenticated
  USING (true);

-- Função para registrar entrada automaticamente quando pagamento é criado
CREATE OR REPLACE FUNCTION register_payment_in_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  -- Buscar informações da ordem
  INSERT INTO cash_flow (
    type,
    amount,
    description,
    category,
    payment_method,
    order_id,
    payment_id,
    date
  )
  SELECT
    'entrada',
    NEW.amount,
    'Pagamento OS - ' || so.client_name || ' (' || so.equipment || ')',
    'Ordem de Serviço',
    NEW.method,
    NEW.order_id,
    NEW.id,
    CURRENT_DATE
  FROM service_orders so
  WHERE so.id = NEW.order_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para registrar pagamento no fluxo de caixa
CREATE TRIGGER trigger_register_payment_in_cash_flow
  AFTER INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION register_payment_in_cash_flow();

-- Função para remover entrada do fluxo de caixa quando pagamento é excluído
CREATE OR REPLACE FUNCTION remove_payment_from_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM cash_flow
  WHERE payment_id = OLD.id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger para remover do fluxo de caixa quando pagamento é excluído
CREATE TRIGGER trigger_remove_payment_from_cash_flow
  BEFORE DELETE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION remove_payment_from_cash_flow();
