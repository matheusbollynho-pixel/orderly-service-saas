-- Suporte a múltiplas formas de pagamento na Nota de Balcão
ALTER TABLE balcao_orders
  ADD COLUMN IF NOT EXISTS payment_methods JSONB DEFAULT '[]'::jsonb;
